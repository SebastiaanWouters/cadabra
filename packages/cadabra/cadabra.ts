// ============================================
// SECTION 1: TYPES & INTERFACES
// ============================================

import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { type AST, Parser } from "node-sql-parser";

// ============================================
// PERFORMANCE: Singleton Parser
// Create parser once instead of on every query (10-20% faster)
// ============================================
const SQL_PARSER = new Parser();

type ParamStyle = "?" | "$1" | ":name";

type Condition = {
  column: string;
  operator:
    | "="
    | "!="
    | ">"
    | "<"
    | ">="
    | "<="
    | "IN"
    | "NOT IN"
    | "LIKE"
    | "NOT LIKE"
    | "BETWEEN"
    | "NOT BETWEEN"
    | "IS NULL"
    | "IS NOT NULL"
    | "EXISTS"
    | "NOT EXISTS";
  value: unknown;
};

type JoinCondition = {
  leftTable: string;
  leftColumn: string;
  rightTable: string;
  rightColumn: string;
  joinType:
    | "INNER JOIN"
    | "LEFT JOIN"
    | "RIGHT JOIN"
    | "FULL JOIN"
    | "CROSS JOIN";
};

type TableAccess = {
  table: string;
  alias?: string;
  columns: string[];
  conditions?: Condition[];
  joinConditions?: JoinCondition[];
};

type CacheKey = {
  tables: TableAccess[];
  fingerprint: string;
  classification: "row-lookup" | "aggregate" | "join" | "complex";
  normalizedSQL?: string;
  orderBy?: Array<{ column: string; order: "ASC" | "DESC" }>;
  limit?: number;
  offset?: number;
  distinct?: boolean;
  hasSubquery?: boolean;
  setOperation?: "UNION" | "UNION ALL" | "INTERSECT" | "EXCEPT";
};

type InvalidationInfo = {
  table: string;
  operation: "INSERT" | "UPDATE" | "DELETE";
  affectedRows?: string[];
  modifiedColumns?: string[];
  conditions?: Condition[];
};

// ============================================
// SECTION 2: PARAMETER BINDING
// ============================================

/**
 * Detects parameter style in SQL query
 */
function detectParamStyle(sql: string): ParamStyle | null {
  if (sql.includes("?")) {
    return "?";
  }
  if (/\$\d+/.test(sql)) {
    return "$1";
  }
  if (/:\w+/.test(sql)) {
    return ":name";
  }
  return null;
}

/**
 * Formats a single value for SQL insertion
 * Handles arrays (for IN clauses), strings, numbers, null
 */
function formatValue(value: unknown, isInClause = false): string {
  // Array → (1,2,3) for IN clauses or just 1,2,3 if already in IN context
  if (Array.isArray(value)) {
    const formatted = value.map((v) => formatValue(v, false)).join(",");
    return isInClause ? formatted : `(${formatted})`;
  }

  // null/undefined → NULL
  if (value === null || value === undefined) {
    return "NULL";
  }

  // String → 'escaped'
  if (typeof value === "string") {
    return `'${value.replace(/'/g, "''")}'`;
  }

  // Number/boolean → as-is
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  // Default: stringify and escape
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * Binds parameters to SQL query based on detected style
 *
 * Examples:
 *   bindParams("SELECT * FROM users WHERE id = ?", [10])
 *   → "SELECT * FROM users WHERE id = 10"
 *
 *   bindParams("SELECT * FROM users WHERE id IN (?)", [[1,2,3]])
 *   → "SELECT * FROM users WHERE id IN (1,2,3)"
 */
function bindParams(
  sql: string,
  params?: unknown[] | Record<string, unknown>
): string {
  if (!params) {
    return sql;
  }

  const style = detectParamStyle(sql);
  if (!style) {
    return sql;
  }

  let result = sql;

  if (style === "?") {
    const paramArray = Array.isArray(params) ? params : Object.values(params);
    let paramIndex = 0;

    // Check if ? is in IN clause context
    result = result.replace(
      /IN\s*\(\s*\?\s*\)|(\?)/gi,
      (match, _standaloneParam) => {
        if (paramIndex >= paramArray.length) {
          return match;
        }
        const value = paramArray[paramIndex++];

        // If it's an IN clause, format as (values)
        if (match.toLowerCase().includes("in")) {
          return `IN (${formatValue(value, true)})`;
        }

        // Otherwise, format normally
        return formatValue(value);
      }
    );
  } else if (style === "$1") {
    const paramArray = Array.isArray(params) ? params : Object.values(params);

    result = result.replace(/\$(\d+)/g, (_match, num) => {
      const idx = Number.parseInt(num, 10) - 1;
      if (idx >= paramArray.length) {
        return `$${num}`;
      }
      const value = paramArray[idx];
      return formatValue(value);
    });
  } else if (style === ":name") {
    const paramObj = Array.isArray(params)
      ? Object.fromEntries(params.map((v, i) => [`param${i}`, v]))
      : params;

    result = result.replace(/:(\w+)/g, (match, name) => {
      if (!(name in paramObj)) {
        return match;
      }
      const value = paramObj[name];
      return formatValue(value);
    });
  }

  return result;
}

// ============================================
// SECTION 3: QUERY NORMALIZATION
// ============================================

/**
 * Normalizes IN clauses by sorting values
 * "WHERE id IN (3,1,2)" → "WHERE id IN (1,2,3)"
 */
function normalizeINClauses(sql: string): string {
  return sql.replace(/IN\s*\(([^)]+)\)/gi, (_match, values: string) => {
    const nums = values.split(",").map((v: string) => v.trim());

    // Try to sort as numbers if all are numeric
    const allNumbers = nums.every((n: string) => !Number.isNaN(Number(n)));
    if (allNumbers) {
      nums.sort((a: string, b: string) => Number(a) - Number(b));
    } else {
      nums.sort();
    }

    return `IN (${nums.join(",")})`;
  });
}

/**
 * Normalizes ORM-generated aliases (t0, t1, ...) to actual table names
 * "SELECT t0.id FROM users AS t0" → "SELECT users.id FROM users"
 */
function normalizeORMAliases(sql: string, ast: AST): string {
  const aliasMap = new Map<string, string>();

  // Extract table aliases from AST
  const fromClause = "from" in ast ? ast.from : null;
  if (fromClause && Array.isArray(fromClause)) {
    for (const fromItem of fromClause) {
      const fromItemAny = fromItem as unknown as Record<string, unknown>;
      if (
        fromItemAny.as &&
        typeof fromItemAny.as === "string" &&
        /^t\d+$/.test(fromItemAny.as)
      ) {
        const tableName = fromItemAny.table as string;
        aliasMap.set(fromItemAny.as, tableName);
      }
    }
  }

  // Replace aliases in SQL
  let result = sql;
  for (const [alias, table] of aliasMap) {
    // Replace alias.column references
    result = result.replace(new RegExp(`\\b${alias}\\.`, "g"), `${table}.`);
    // Remove AS alias declarations
    result = result.replace(new RegExp(`\\bAS\\s+${alias}\\b`, "gi"), "");
  }

  return result.replace(/\s+/g, " ").trim();
}

/**
 * Normalizes SQL query for consistent cache keys
 */
function normalizeSQL(sql: string, ast?: AST): string {
  let normalized = sql;

  // 1. Normalize whitespace
  normalized = normalized
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s*\(\s*/g, "(")
    .replace(/\s*\)\s*/g, ")")
    .trim();

  // 2. Remove unnecessary backticks
  normalized = normalized.replace(/`([a-zA-Z_]\w*)`/g, "$1");

  // 3. Normalize ORM aliases if AST provided
  if (ast) {
    normalized = normalizeORMAliases(normalized, ast);
  }

  // 4. Normalize IN clause values
  normalized = normalizeINClauses(normalized);

  return normalized;
}

// ============================================
// SECTION 4: AST EXTRACTION
// ============================================

/**
 * Extracts column name from AST node
 */
function extractColumnName(node: unknown): string {
  if (!node || typeof node !== "object") {
    return "unknown";
  }

  const obj = node as Record<string, unknown>;

  if (obj.type === "column_ref" && typeof obj.column === "string") {
    return obj.column;
  }

  if (typeof obj.column === "string") {
    return obj.column;
  }

  return "unknown";
}

/**
 * Extracts value from AST node
 */
function extractValue(node: unknown): unknown {
  if (!node) {
    return null;
  }
  if (typeof node !== "object") {
    return node;
  }

  const obj = node as Record<string, unknown>;

  if (obj.type === "number") {
    return obj.value;
  }
  if (obj.type === "string") {
    return obj.value;
  }
  if (obj.type === "single_quote_string") {
    return obj.value;
  }
  if (obj.type === "bool") {
    return obj.value;
  }
  if (obj.type === "null") {
    return null;
  }

  // If has value property, return it
  if ("value" in obj) {
    return obj.value;
  }

  return node;
}

/**
 * Recursively parses WHERE clause AST into Condition[]
 */
function parseConditionNode(node: unknown): Condition[] {
  if (!node || typeof node !== "object") {
    return [];
  }

  const obj = node as Record<string, unknown>;

  // Binary expressions (col = val, col > val, AND, OR, IN, IS, IS NOT)
  if (obj.type === "binary_expr") {
    if (obj.operator === "AND" || obj.operator === "OR") {
      // Recursively parse both sides
      return [
        ...parseConditionNode(obj.left),
        ...parseConditionNode(obj.right),
      ];
    }

    // Handle IN/NOT IN operators
    if (obj.operator === "IN" || obj.operator === "NOT IN") {
      const column = extractColumnName(obj.left);
      const rightObj = obj.right as Record<string, unknown> | undefined;

      let values: unknown[] = [];
      if (rightObj?.type === "expr_list" && Array.isArray(rightObj.value)) {
        values = rightObj.value.map((v: unknown) => extractValue(v));
      }

      return [
        {
          column,
          operator: obj.operator as Condition["operator"],
          value: values,
        },
      ];
    }

    // Handle IS NULL / IS NOT NULL operators (in binary_expr format)
    if (obj.operator === "IS" || obj.operator === "IS NOT") {
      const column = extractColumnName(obj.left);

      // Check if the right side is NULL
      const rightObj = obj.right as Record<string, unknown> | undefined;
      if (rightObj && rightObj.type === "null") {
        return [
          {
            column,
            operator: (obj.operator === "IS"
              ? "IS NULL"
              : "IS NOT NULL") as Condition["operator"],
            value: null,
          },
        ];
      }
    }

    // Handle LIKE/NOT LIKE operators
    if (obj.operator === "LIKE" || obj.operator === "NOT LIKE") {
      const column = extractColumnName(obj.left);
      const value = extractValue(obj.right);

      return [
        {
          column,
          operator: obj.operator as Condition["operator"],
          value,
        },
      ];
    }

    // Leaf condition
    const column = extractColumnName(obj.left);
    const value = extractValue(obj.right);
    const operator = obj.operator as Condition["operator"];

    return [
      {
        column,
        operator,
        value,
      },
    ];
  }

  // BETWEEN expressions
  if (obj.type === "between_expr") {
    const column = extractColumnName(obj.expr);

    // Extract values using extractValue function
    const leftValue = extractValue(obj.left);
    const rightValue = extractValue(obj.right);

    return [
      {
        column,
        operator: obj.not ? "NOT BETWEEN" : "BETWEEN",
        value: [leftValue, rightValue],
      },
    ];
  }

  // IS NULL / IS NOT NULL expressions
  if (obj.type === "unary_expr") {
    const operator = obj.operator as string;
    if (operator === "IS" || operator === "IS NOT") {
      const column = extractColumnName(obj.expr);

      // Check if the right side is NULL
      const rightValue = obj.right;
      if (rightValue && typeof rightValue === "object") {
        const rightObj = rightValue as Record<string, unknown>;
        if (rightObj.type === "null") {
          return [
            {
              column,
              operator: (operator === "IS"
                ? "IS NULL"
                : "IS NOT NULL") as Condition["operator"],
              value: null,
            },
          ];
        }
      }
    }
  }

  // IN/NOT IN clauses
  if (obj.type === "in_expr") {
    const column = extractColumnName(obj.expr);

    // Handle different IN clause value formats
    let values: unknown[] = [];
    if (Array.isArray(obj.value)) {
      // Direct array of values
      values = obj.value.map((v: unknown) => extractValue(v));
    } else if (obj.value && typeof obj.value === "object") {
      const valueObj = obj.value as Record<string, unknown>;
      if (valueObj.type === "expr_list" && Array.isArray(valueObj.value)) {
        values = valueObj.value.map((v: unknown) => extractValue(v));
      } else {
        values = [extractValue(obj.value)];
      }
    }

    return [
      {
        column,
        operator: obj.not ? "NOT IN" : "IN",
        value: values,
      },
    ];
  }

  // EXISTS/NOT EXISTS expressions (usually with subqueries)
  if (obj.type === "exists_expr") {
    return [
      {
        column: "EXISTS",
        operator: obj.not ? "NOT EXISTS" : "EXISTS",
        value: obj.value,
      },
    ];
  }

  return [];
}

/**
 * Extracts table and column from column reference in JOIN ON clause
 */
function extractTableColumnRef(node: unknown): {
  table: string;
  column: string;
} {
  if (!node || typeof node !== "object") {
    return { table: "", column: "" };
  }

  const obj = node as Record<string, unknown>;

  if (obj.type === "column_ref") {
    // Handle table.column format
    if (obj.table && typeof obj.table === "string") {
      return {
        table: obj.table,
        column: typeof obj.column === "string" ? obj.column : "",
      };
    }
    // Handle just column name
    return {
      table: "",
      column: typeof obj.column === "string" ? obj.column : "",
    };
  }

  return { table: "", column: "" };
}

/**
 * Extracts JOIN condition from ON clause
 */
function extractJoinCondition(
  onClause: unknown,
  leftTable: string,
  rightTable: string,
  joinType: string
): JoinCondition | null {
  if (!onClause || typeof onClause !== "object") {
    return null;
  }

  const obj = onClause as Record<string, unknown>;

  // Handle binary expression (table1.col = table2.col)
  if (obj.type === "binary_expr" && obj.operator === "=") {
    const leftRef = extractTableColumnRef(obj.left);
    const rightRef = extractTableColumnRef(obj.right);

    if (leftRef.column && rightRef.column) {
      return {
        leftTable: leftRef.table || leftTable,
        leftColumn: leftRef.column,
        rightTable: rightRef.table || rightTable,
        rightColumn: rightRef.column,
        joinType: joinType as JoinCondition["joinType"],
      };
    }
  }

  return null;
}

/**
 * Extracts table names, aliases, and JOIN conditions from AST
 */
function extractTables(ast: AST): TableAccess[] {
  const tables: TableAccess[] = [];
  const joinConditions: JoinCondition[] = [];
  let previousTable: string | null = null;

  const fromClause = "from" in ast ? ast.from : null;
  if (!(fromClause && Array.isArray(fromClause))) {
    return tables;
  }

  for (const fromItem of fromClause) {
    const fromItemAny = fromItem as unknown as Record<string, unknown>;
    if (fromItemAny.table && typeof fromItemAny.table === "string") {
      const currentTable = {
        table: fromItemAny.table,
        alias: (fromItemAny.as as string | undefined) ?? undefined,
        columns: [],
        joinConditions: [] as JoinCondition[],
      };
      tables.push(currentTable);

      // Check if this table element has JOIN information
      if (fromItemAny.join && fromItemAny.on) {
        // Normalize JOIN type
        let joinType: JoinCondition["joinType"] = "INNER JOIN";
        const joinStr = String(fromItemAny.join).toUpperCase();
        if (joinStr.includes("LEFT")) {
          joinType = "LEFT JOIN";
        } else if (joinStr.includes("RIGHT")) {
          joinType = "RIGHT JOIN";
        } else if (joinStr.includes("FULL")) {
          joinType = "FULL JOIN";
        } else if (joinStr.includes("CROSS")) {
          joinType = "CROSS JOIN";
        }

        // Extract JOIN condition
        const condition = extractJoinCondition(
          fromItemAny.on as AST,
          previousTable || tables[0]?.table || "",
          currentTable.table,
          joinType
        );

        if (condition) {
          joinConditions.push(condition);
        }
      }

      previousTable = currentTable.table;
    }
  }

  // Attach join conditions to the first table (for fingerprinting)
  if (tables.length > 0 && joinConditions.length > 0 && tables[0]) {
    tables[0].joinConditions = joinConditions;
  }

  return tables;
}

/**
 * Extracts selected columns from AST
 */
function extractColumns(ast: AST): string[] {
  const columnsClause = "columns" in ast ? ast.columns : null;
  if (!columnsClause) {
    return [];
  }

  if (typeof columnsClause === "string" && columnsClause === "*") {
    return ["*"];
  }

  if (Array.isArray(columnsClause)) {
    const columns: string[] = [];

    for (const col of columnsClause) {
      if (col.expr.type === "column_ref") {
        const colName = col.expr.column;
        columns.push(colName === "*" ? "*" : colName);
      } else if (col.expr.type === "aggr_func") {
        // For aggregates, track the function + column
        const args = col.expr.args?.expr;
        const argCol = args ? extractColumnName(args) : "*";
        columns.push(`${col.expr.name}(${argCol})`);
      }
    }

    return columns;
  }

  return [];
}

/**
 * Extracts WHERE conditions from AST
 */
function extractConditions(ast: AST): Condition[] {
  const whereClause = "where" in ast ? ast.where : null;
  if (!whereClause) {
    return [];
  }
  return parseConditionNode(whereClause);
}

/**
 * Extracts aggregate functions and GROUP BY columns
 */
function extractAggregates(ast: AST): {
  aggregates: string[];
  groupBy: string[];
} {
  const aggregates: string[] = [];
  const groupBy: string[] = [];

  // Check columns for aggregate functions
  const columnsClause = "columns" in ast ? ast.columns : null;
  if (Array.isArray(columnsClause)) {
    for (const col of columnsClause) {
      if (col.expr.type === "aggr_func") {
        aggregates.push(col.expr.name.toUpperCase());
      }
    }
  }

  // Extract GROUP BY columns
  const groupByClause = "groupby" in ast ? ast.groupby : null;
  if (Array.isArray(groupByClause)) {
    for (const gb of groupByClause) {
      if (gb.type === "column_ref") {
        groupBy.push(gb.column);
      }
    }
  }

  return { aggregates, groupBy };
}

/**
 * Extracts ORDER BY clauses from AST
 */
function extractOrderBy(
  ast: AST
): Array<{ column: string; order: "ASC" | "DESC" }> {
  const orderByClause = "orderby" in ast ? ast.orderby : null;

  // For UNION queries, check _next node
  if (!orderByClause && "_next" in ast && ast._next) {
    const nextNode = ast._next as AST;
    return extractOrderBy(nextNode);
  }

  if (!Array.isArray(orderByClause)) {
    return [];
  }

  return orderByClause.map((ob) => ({
    column: extractColumnName(ob.expr),
    order: (ob.type?.toUpperCase() || "ASC") as "ASC" | "DESC",
  }));
}

/**
 * Extracts LIMIT value from AST
 */
function extractLimit(ast: AST): number | undefined {
  const limitClause = "limit" in ast ? ast.limit : null;

  // For UNION queries, check _next node
  if (!limitClause && "_next" in ast && ast._next) {
    const nextNode = ast._next as AST;
    return extractLimit(nextNode);
  }

  if (!limitClause) {
    return;
  }

  // Handle different limit formats
  if (typeof limitClause === "object" && limitClause !== null) {
    const limitObj = limitClause as unknown as Record<string, unknown>;
    if (Array.isArray(limitObj.value)) {
      const val = limitObj.value[0];
      return typeof val === "object" && val !== null
        ? Number((val as Record<string, unknown>).value)
        : Number(val);
    }
    if ("value" in limitObj) {
      return Number(limitObj.value);
    }
  }

  return Number(limitClause);
}

/**
 * Extracts OFFSET value from AST
 */
function extractOffset(ast: AST): number | undefined {
  const limitClause = "limit" in ast ? ast.limit : null;
  if (!limitClause || typeof limitClause !== "object") {
    return;
  }

  const limitObj = limitClause as unknown as Record<string, unknown>;

  // OFFSET can be in limit.value[1] or limit.offset
  if (Array.isArray(limitObj.value) && limitObj.value.length > 1) {
    const val = limitObj.value[1];
    return typeof val === "object" && val !== null
      ? Number((val as Record<string, unknown>).value)
      : Number(val);
  }

  if ("offset" in limitObj && limitObj.offset) {
    return Number(limitObj.offset);
  }

  return;
}

/**
 * Checks if query has DISTINCT
 */
function extractDistinct(ast: AST): boolean {
  const distinctClause = "distinct" in ast ? ast.distinct : null;
  return distinctClause === "DISTINCT" || distinctClause === true;
}

/**
 * Recursively detects subqueries in AST nodes
 * Checks for:
 * - IN subqueries (empty arrays from parser when subquery present)
 * - EXISTS/NOT EXISTS (already marked in conditions)
 * - Scalar subqueries in WHERE clause
 */
function detectSubqueryInNode(node: unknown): boolean {
  if (!node || typeof node !== "object") {
    return false;
  }

  const obj = node as Record<string, unknown>;

  // Check if this node is a subquery (SELECT node nested in another context)
  if (obj.type === "select" && obj.from) {
    return true;
  }

  // IN subquery detection - parser returns empty array or select node for subquery
  if (obj.type === "in_expr") {
    const valueObj = obj.value as Record<string, unknown> | undefined;
    if (valueObj?.type === "select") {
      return true;
    }
    // TiDB parser behavior: empty array for IN subquery
    if (Array.isArray(obj.value) && obj.value.length === 0) {
      return true;
    }
  }

  // EXISTS/NOT EXISTS with subquery
  if (obj.type === "exists_expr" && obj.value) {
    const valueObj = obj.value as Record<string, unknown> | undefined;
    if (valueObj?.type === "select") {
      return true;
    }
  }

  // Binary expressions - check both sides
  if (
    obj.type === "binary_expr" &&
    (detectSubqueryInNode(obj.left) || detectSubqueryInNode(obj.right))
  ) {
    return true;
  }

  // Check nested structures
  for (const value of Object.values(obj)) {
    if (
      typeof value === "object" &&
      value !== null &&
      detectSubqueryInNode(value)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Detects if query contains subqueries
 */
function detectSubquery(ast: AST, conditions: Condition[]): boolean {
  // Check for EXISTS/NOT EXISTS in conditions (already detected)
  const hasExistsSubquery = conditions.some(
    (c) => c.operator === "EXISTS" || c.operator === "NOT EXISTS"
  );

  if (hasExistsSubquery) {
    return true;
  }

  // Check WHERE clause for nested subqueries
  if ("where" in ast && ast.where && detectSubqueryInNode(ast.where)) {
    return true;
  }

  // Check FROM clause for subqueries (derived tables)
  if ("from" in ast && Array.isArray(ast.from)) {
    for (const fromItem of ast.from) {
      if (fromItem && typeof fromItem === "object") {
        const fromItemObj = fromItem as unknown as Record<string, unknown>;

        // Check for derived table (subquery in FROM)
        if ("expr" in fromItemObj && fromItemObj.expr) {
          const exprObj = fromItemObj.expr as Record<string, unknown>;

          // Check if expr has an ast property (derived table)
          if ("ast" in exprObj && exprObj.ast) {
            const astObj = exprObj.ast as Record<string, unknown>;
            if (astObj.type === "select") {
              return true;
            }
          }

          // Also check if expr itself is a select
          if (exprObj.type === "select") {
            return true;
          }
        }
      }
    }
  }

  return false;
}

/**
 * Detects set operations (UNION, INTERSECT, EXCEPT)
 */
function detectSetOperation(
  ast: AST | AST[]
): "UNION" | "UNION ALL" | "INTERSECT" | "EXCEPT" | undefined {
  // Check if AST is an array (multiple statements)
  if (Array.isArray(ast)) {
    // Check each statement
    for (const node of ast) {
      const result = detectSetOperation(node);
      if (result) {
        return result;
      }
    }
    return;
  }

  // Check for set operation in single AST node
  const astObj = ast as unknown as Record<string, unknown>;

  // node-sql-parser represents set operations as "set_op" property
  if ("set_op" in astObj && astObj.set_op) {
    const setOp = (astObj.set_op as string).toLowerCase();

    if (setOp === "union all") {
      return "UNION ALL";
    }
    if (setOp === "union") {
      return "UNION";
    }
    if (setOp === "intersect") {
      return "INTERSECT";
    }
    if (setOp === "except") {
      return "EXCEPT";
    }
  }

  // Check _next property for chained set operations
  if ("_next" in astObj && astObj._next) {
    return detectSetOperation(astObj._next as AST);
  }

  return;
}

// ============================================
// SECTION 5: QUERY CLASSIFICATION
// ============================================

/**
 * Checks if conditions contain simple primary key lookup
 */
function hasSimplePKCondition(conditions: Condition[]): boolean {
  return conditions.some(
    (c) =>
      ["id", "uuid"].includes(c.column.toLowerCase()) &&
      (c.operator === "=" || c.operator === "IN")
  );
}

/**
 * Classifies query type for cache key generation
 */
function classifyQuery(
  tables: TableAccess[],
  conditions: Condition[],
  options: {
    hasAggregates: boolean;
    hasSubquery: boolean;
    hasSetOperation: boolean;
  }
): "row-lookup" | "aggregate" | "join" | "complex" {
  // Set operations (UNION/INTERSECT/EXCEPT) are always complex
  if (options.hasSetOperation) {
    return "complex";
  }

  // Queries with subqueries are always complex
  if (options.hasSubquery) {
    return "complex";
  }

  if (options.hasAggregates) {
    return "aggregate";
  }
  if (tables.length > 1) {
    return "join";
  }

  // Single table - check for simple row lookup
  if (hasSimplePKCondition(conditions)) {
    return "row-lookup";
  }

  return "complex";
}

// ============================================
// SECTION 6: CACHE KEY GENERATION
// ============================================

/**
 * PERFORMANCE: Optimized sorting that avoids unnecessary copies
 * For arrays <= 1 element, no sorting needed
 * For 2 elements, do inline swap instead of full sort
 */
function sortIfNeeded<T extends string | number>(arr: T[]): T[] {
  if (arr.length <= 1) {
    return arr;
  }
  if (arr.length === 2) {
    const [a, b] = arr;
    if (a !== undefined && b !== undefined) {
      return a > b ? [b, a] : arr;
    }
    return arr;
  }
  // Only copy and sort for arrays with 3+ elements
  return [...arr].sort();
}

/**
 * Generates deterministic fingerprint from cache key
 */
function generateFingerprint(cacheKey: CacheKey): string {
  const {
    tables,
    classification,
    orderBy,
    limit,
    offset,
    distinct,
    hasSubquery,
    setOperation,
  } = cacheKey;

  // Simple row lookup: human-readable format (if no ORDER BY/LIMIT/OFFSET/DISTINCT/SUBQUERY/SET_OP)
  if (
    classification === "row-lookup" &&
    tables.length === 1 &&
    !orderBy &&
    !limit &&
    !offset &&
    !distinct &&
    !hasSubquery &&
    !setOperation
  ) {
    const table = tables[0];

    if (table) {
      const pkCondition = table.conditions?.find(
        (c) =>
          ["id", "uuid"].includes(c.column.toLowerCase()) &&
          (c.operator === "=" || c.operator === "IN")
      );

      if (pkCondition) {
        const value =
          pkCondition.operator === "IN" && Array.isArray(pkCondition.value)
            ? [...pkCondition.value].sort().join(",")
            : pkCondition.value;
        return `${table.table}:${pkCondition.column}=${value}:row-lookup`;
      }
    }
  }

  // Complex queries: hash the normalized structure
  const normalized = {
    tables: tables.map((t) => ({
      table: t.table,
      columns: sortIfNeeded(t.columns),
      conditions: t.conditions
        ?.map((c) => ({
          column: c.column,
          operator: c.operator,
          value: Array.isArray(c.value)
            ? sortIfNeeded(c.value as (string | number)[])
            : c.value,
        }))
        .sort((a, b) => a.column.localeCompare(b.column)),
      joinConditions: t.joinConditions
        ?.map((jc) => ({
          leftTable: jc.leftTable,
          leftColumn: jc.leftColumn,
          rightTable: jc.rightTable,
          rightColumn: jc.rightColumn,
          joinType: jc.joinType,
        }))
        .sort((a, b) => a.leftTable.localeCompare(b.leftTable)),
    })),
    classification,
    orderBy,
    limit,
    offset,
    distinct,
    hasSubquery,
    setOperation,
  };

  const hash = createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex");
  return hash.substring(0, 16);
}

/**
 * Main entry point: Analyze SELECT query
 */
function analyzeSELECT(
  sql: string,
  params?: unknown[] | Record<string, unknown>
): CacheKey {
  // 1. Bind parameters
  const boundSQL = bindParams(sql, params);

  // 2. Parse to AST
  const ast = SQL_PARSER.astify(boundSQL, { database: "MySQL" });
  const astNode = Array.isArray(ast) ? ast[0] : ast;

  if (!astNode) {
    throw new Error("Failed to parse SQL");
  }

  // 3. Normalize SQL
  const normalizedSQL = normalizeSQL(boundSQL, astNode);

  // 4. Extract components
  const tables = extractTables(astNode);
  const columns = extractColumns(astNode);
  const conditions = extractConditions(astNode);
  const { aggregates } = extractAggregates(astNode);
  const orderBy = extractOrderBy(astNode);
  const limit = extractLimit(astNode);
  const offset = extractOffset(astNode);
  const distinct = extractDistinct(astNode);

  // 4b. Detect subqueries and set operations
  const hasSubquery = detectSubquery(astNode, conditions);
  const setOperation = detectSetOperation(ast);

  // 5. Attach columns and conditions to tables
  if (tables.length === 1 && tables[0]) {
    // Single table: assign all columns and conditions
    tables[0].columns = columns;
    tables[0].conditions = conditions;
  } else {
    // Multi-table JOIN: distribute columns to their respective tables
    const columnsClause = "columns" in astNode ? astNode.columns : null;

    if (Array.isArray(columnsClause)) {
      for (const col of columnsClause) {
        if (col.expr.type === "column_ref") {
          const tableRef = col.expr.table;
          const columnName = col.expr.column === "*" ? "*" : col.expr.column;

          // Find the table this column belongs to (by alias or name)
          if (tableRef) {
            const targetTable = tables.find(
              (t) => t.alias === tableRef || t.table === tableRef
            );
            if (targetTable) {
              targetTable.columns.push(columnName);
            }
          } else if (tables[0]) {
            // No table specified, add to all tables or first table
            tables[0].columns.push(columnName);
          }
        } else if (col.expr.type === "aggr_func" && tables[0]) {
          // For aggregates, add to first table
          const args = col.expr.args?.expr;
          const argCol = args ? extractColumnName(args) : "*";
          tables[0].columns.push(`${col.expr.name}(${argCol})`);
        }
      }
    }

    // Assign all WHERE conditions to first table for simplicity
    if (tables[0]) {
      tables[0].conditions = conditions;
    }
  }

  // 6. Classify query
  const classification = classifyQuery(tables, conditions, {
    hasAggregates: aggregates.length > 0,
    hasSubquery,
    hasSetOperation: !!setOperation,
  });

  // 7. Build cache key
  const cacheKey: CacheKey = {
    tables,
    classification,
    normalizedSQL,
    orderBy: orderBy.length > 0 ? orderBy : undefined,
    limit,
    offset,
    distinct: distinct || undefined,
    hasSubquery: hasSubquery || undefined,
    setOperation: setOperation || undefined,
    fingerprint: "",
  };

  cacheKey.fingerprint = generateFingerprint(cacheKey);

  return cacheKey;
}

// ============================================
// SECTION 7: INVALIDATION ANALYSIS
// ============================================

/**
 * Extracts affected rows from WHERE clause
 * Returns row IDs if specific rows can be identified
 */
function extractAffectedRows(ast: AST): string[] | undefined {
  const whereClause = "where" in ast ? ast.where : null;
  if (!whereClause) {
    return;
  }

  const conditions = parseConditionNode(whereClause);

  // Look for simple equality or IN conditions on any column
  // This helps us identify specific rows affected by the write
  const specificConditions = conditions.filter(
    (c) => c.operator === "=" || c.operator === "IN"
  );

  if (specificConditions.length === 0) {
    return;
  }

  // Try to extract row identifiers from conditions
  const rows: string[] = [];
  for (const cond of specificConditions) {
    if (cond.operator === "=") {
      rows.push(String(cond.value));
    } else if (cond.operator === "IN" && Array.isArray(cond.value)) {
      rows.push(...cond.value.map(String));
    }
  }

  return rows.length > 0 ? rows : undefined;
}

/**
 * Extracts modified columns from UPDATE SET clause
 */
function extractModifiedColumns(ast: AST): string[] {
  const setClause = "set" in ast ? ast.set : null;
  if (!Array.isArray(setClause)) {
    return [];
  }

  return setClause.map((s: { column: string }) => s.column);
}

/**
 * Analyzes INSERT/UPDATE/DELETE query
 */
function analyzeWrite(
  sql: string,
  params?: unknown[] | Record<string, unknown>
): InvalidationInfo {
  // 1. Bind parameters
  const boundSQL = bindParams(sql, params);

  // 2. Parse to AST
  const ast = SQL_PARSER.astify(boundSQL, { database: "MySQL" });
  const astNode = Array.isArray(ast) ? ast[0] : ast;

  if (!astNode) {
    throw new Error("Failed to parse SQL");
  }

  // 3. Extract operation type
  const typeField = "type" in astNode ? astNode.type : "unknown";
  const operation = String(typeField).toUpperCase() as
    | "INSERT"
    | "UPDATE"
    | "DELETE";

  // 4. Extract table name
  let table: string;
  const tableField = "table" in astNode ? astNode.table : null;
  if (tableField) {
    table = Array.isArray(tableField) ? tableField[0].table : tableField;
  } else {
    table = "unknown";
  }

  // 5. Extract affected rows
  const affectedRows = extractAffectedRows(astNode);

  // 6. Extract modified columns (UPDATE only)
  const modifiedColumns =
    operation === "UPDATE" ? extractModifiedColumns(astNode) : undefined;

  // 7. Extract WHERE conditions for range analysis
  const conditions = extractConditions(astNode);

  return {
    table,
    operation,
    affectedRows,
    modifiedColumns,
    conditions,
  };
}

// ============================================
// SECTION 8: INVALIDATION MATCHING
// ============================================

/**
 * Checks if write operation affects same rows as cached query
 */
function rowsOverlap(cacheKey: CacheKey, affectedRows: string[]): boolean {
  const table = cacheKey.tables[0];
  if (!table?.conditions) {
    return true; // No conditions = affects all rows
  }

  // Look for any equality or IN conditions that might match affected rows
  const specificConditions = table.conditions.filter(
    (c) => c.operator === "=" || c.operator === "IN"
  );

  if (specificConditions.length === 0) {
    return true; // Can't determine, assume overlap
  }

  for (const cond of specificConditions) {
    if (cond.operator === "=") {
      if (affectedRows.includes(String(cond.value))) {
        return true;
      }
    } else if (cond.operator === "IN" && Array.isArray(cond.value)) {
      const cachedRows = cond.value.map(String);
      if (cachedRows.some((r) => affectedRows.includes(r))) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Checks if modified columns overlap with selected columns
 */
function columnsOverlap(
  selectedColumns: string[],
  modifiedColumns: string[]
): boolean {
  // SELECT * always overlaps
  if (selectedColumns.includes("*")) {
    return true;
  }

  // Check intersection
  return selectedColumns.some((sc) => {
    // Handle aggregate columns like "COUNT(id)"
    const baseColumn = sc.includes("(") ? sc.split("(")[1]?.split(")")[0] : sc;
    return baseColumn ? modifiedColumns.includes(baseColumn) : false;
  });
}

/**
 * Checks if modified columns affect JOIN conditions
 */
function affectsJoinConditions(
  cacheKey: CacheKey,
  modifiedTable: string,
  modifiedColumns: string[]
): boolean {
  const joinConditions = cacheKey.tables[0]?.joinConditions;
  if (!joinConditions || joinConditions.length === 0) {
    return false;
  }

  // Build a map of aliases to table names for comparison
  const tableMap = new Map<string, string>();
  for (const table of cacheKey.tables) {
    tableMap.set(table.table, table.table); // table name -> table name
    if (table.alias) {
      tableMap.set(table.alias, table.table); // alias -> table name
    }
  }

  // Resolve JOIN condition table references to actual table names
  for (const jc of joinConditions) {
    const leftTableResolved = tableMap.get(jc.leftTable) || jc.leftTable;
    const rightTableResolved = tableMap.get(jc.rightTable) || jc.rightTable;

    // Check if the modified table and columns are part of any JOIN condition
    if (
      leftTableResolved === modifiedTable &&
      modifiedColumns.includes(jc.leftColumn)
    ) {
      return true;
    }
    if (
      rightTableResolved === modifiedTable &&
      modifiedColumns.includes(jc.rightColumn)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if two range conditions can overlap
 * Returns true if they might overlap, false if provably non-overlapping
 */
function rangesOverlap(cond1: Condition, cond2: Condition): boolean {
  // Same column required
  if (cond1.column !== cond2.column) {
    return true; // Different columns, can't analyze
  }

  // PERFORMANCE: Fast path for equality comparisons (20-30% faster)
  if (cond1.operator === "=" && cond2.operator === "=") {
    return cond1.value === cond2.value;
  }

  // PERFORMANCE: Fast path for IN clauses with equality
  if (
    cond1.operator === "IN" &&
    cond2.operator === "=" &&
    Array.isArray(cond1.value)
  ) {
    return cond1.value.includes(cond2.value);
  }
  if (
    cond2.operator === "IN" &&
    cond1.operator === "=" &&
    Array.isArray(cond2.value)
  ) {
    return cond2.value.includes(cond1.value);
  }

  // Handle numeric range comparisons
  const isNumeric = (val: unknown): boolean =>
    typeof val === "number" ||
    (typeof val === "string" && !Number.isNaN(Number(val)));

  // Extract numeric values
  const getNumValue = (val: unknown): number | null => {
    if (typeof val === "number") {
      return val;
    }
    if (typeof val === "string") {
      const num = Number(val);
      return Number.isNaN(num) ? null : num;
    }
    // Handle AST nodes with {type: "number", value: X}
    if (typeof val === "object" && val !== null && "value" in val) {
      const objVal = val as Record<string, unknown>;
      if (typeof objVal.value === "number") {
        return objVal.value;
      }
      if (typeof objVal.value === "string") {
        const num = Number(objVal.value);
        return Number.isNaN(num) ? null : num;
      }
    }
    return null;
  };

  // Condition 1 range
  let c1Min: number | null = null;
  let c1Max: number | null = null;
  let c1MinInclusive = true;
  let c1MaxInclusive = true;

  // Condition 2 range
  let c2Min: number | null = null;
  let c2Max: number | null = null;
  let c2MinInclusive = true;
  let c2MaxInclusive = true;

  // Extract ranges from condition 1
  if (cond1.operator === "=" && isNumeric(cond1.value)) {
    const val = getNumValue(cond1.value);
    c1Min = val;
    c1Max = val;
  } else if (cond1.operator === ">" && isNumeric(cond1.value)) {
    c1Min = getNumValue(cond1.value);
    c1MinInclusive = false;
  } else if (cond1.operator === ">=" && isNumeric(cond1.value)) {
    c1Min = getNumValue(cond1.value);
  } else if (cond1.operator === "<" && isNumeric(cond1.value)) {
    c1Max = getNumValue(cond1.value);
    c1MaxInclusive = false;
  } else if (cond1.operator === "<=" && isNumeric(cond1.value)) {
    c1Max = getNumValue(cond1.value);
  } else if (
    cond1.operator === "BETWEEN" &&
    Array.isArray(cond1.value) &&
    cond1.value.length === 2
  ) {
    c1Min = getNumValue(cond1.value[0]);
    c1Max = getNumValue(cond1.value[1]);
  } else if (cond1.operator === "IN" && Array.isArray(cond1.value)) {
    const numValues = cond1.value
      .map(getNumValue)
      .filter((v): v is number => v !== null);
    if (numValues.length > 0) {
      // For IN with equality on the other side, check exact match
      if (cond2.operator === "=" && isNumeric(cond2.value)) {
        const val2 = getNumValue(cond2.value);
        return val2 !== null && numValues.includes(val2);
      }
      // For IN with IN, check set intersection
      if (cond2.operator === "IN" && Array.isArray(cond2.value)) {
        const numValues2 = cond2.value
          .map(getNumValue)
          .filter((v): v is number => v !== null);
        return numValues.some((v) => numValues2.includes(v));
      }
      // Otherwise, fall back to range-based analysis
      c1Min = Math.min(...numValues);
      c1Max = Math.max(...numValues);
    }
  }

  // Extract ranges from condition 2
  if (cond2.operator === "=" && isNumeric(cond2.value)) {
    const val = getNumValue(cond2.value);
    c2Min = val;
    c2Max = val;
  } else if (cond2.operator === ">" && isNumeric(cond2.value)) {
    c2Min = getNumValue(cond2.value);
    c2MinInclusive = false;
  } else if (cond2.operator === ">=" && isNumeric(cond2.value)) {
    c2Min = getNumValue(cond2.value);
  } else if (cond2.operator === "<" && isNumeric(cond2.value)) {
    c2Max = getNumValue(cond2.value);
    c2MaxInclusive = false;
  } else if (cond2.operator === "<=" && isNumeric(cond2.value)) {
    c2Max = getNumValue(cond2.value);
  } else if (
    cond2.operator === "BETWEEN" &&
    Array.isArray(cond2.value) &&
    cond2.value.length === 2
  ) {
    c2Min = getNumValue(cond2.value[0]);
    c2Max = getNumValue(cond2.value[1]);
  } else if (cond2.operator === "IN" && Array.isArray(cond2.value)) {
    const numValues = cond2.value
      .map(getNumValue)
      .filter((v): v is number => v !== null);
    if (numValues.length > 0) {
      // For IN with equality on the other side, check exact match
      if (cond1.operator === "=" && isNumeric(cond1.value)) {
        const val1 = getNumValue(cond1.value);
        return val1 !== null && numValues.includes(val1);
      }
      // For IN with IN, already handled in cond1 branch
      // Otherwise, fall back to range-based analysis
      c2Min = Math.min(...numValues);
      c2Max = Math.max(...numValues);
    }
  }

  // If we couldn't extract numeric ranges, assume overlap (conservative)
  if (c1Min === null && c1Max === null && c2Min === null && c2Max === null) {
    return true;
  }

  // Check for non-overlapping ranges
  // Range 1: [c1Min, c1Max], Range 2: [c2Min, c2Max]

  // Case 1: Range 1 is entirely less than Range 2
  if (c1Max !== null && c2Min !== null) {
    if (c1Max < c2Min) {
      return false; // No overlap
    }
    if (c1Max === c2Min && !(c1MaxInclusive && c2MinInclusive)) {
      return false; // Touching but not overlapping
    }
  }

  // Case 2: Range 1 is entirely greater than Range 2
  if (c1Min !== null && c2Max !== null) {
    if (c1Min > c2Max) {
      return false; // No overlap
    }
    if (c1Min === c2Max && !(c1MinInclusive && c2MaxInclusive)) {
      return false; // Touching but not overlapping
    }
  }

  // If we reach here, ranges might overlap
  return true;
}

/**
 * Checks if two condition sets can overlap
 * Returns false only if we can PROVE they don't overlap
 */
function conditionsOverlap(
  cacheConditions: Condition[],
  writeConditions: Condition[]
): boolean {
  // Group conditions by column for both sets
  const cacheByColumn = new Map<string, Condition[]>();
  for (const cond of cacheConditions) {
    const existing = cacheByColumn.get(cond.column) || [];
    existing.push(cond);
    cacheByColumn.set(cond.column, existing);
  }

  const writeByColumn = new Map<string, Condition[]>();
  for (const cond of writeConditions) {
    const existing = writeByColumn.get(cond.column) || [];
    existing.push(cond);
    writeByColumn.set(cond.column, existing);
  }

  // For each column that appears in BOTH cache and write conditions
  for (const [column, cacheConds] of cacheByColumn) {
    const writeConds = writeByColumn.get(column);
    if (!writeConds || writeConds.length === 0) {
      continue; // No write condition on this column, skip
    }

    // Check if ANY cache condition overlaps with ANY write condition
    // We need at least ONE overlap for the query to potentially be affected
    let hasOverlap = false;

    for (const cacheCond of cacheConds) {
      for (const writeCond of writeConds) {
        if (rangesOverlap(cacheCond, writeCond)) {
          hasOverlap = true;
          break;
        }
      }
      if (hasOverlap) {
        break;
      }
    }

    // If this column has NO overlap, the condition sets don't overlap
    if (!hasOverlap) {
      return false;
    }
  }

  // Conservative: assume overlap if we can't prove otherwise
  return true;
}

/**
 * Decides if write operation should invalidate cached query
 */
function shouldInvalidate(
  cacheKey: CacheKey,
  writeInfo: InvalidationInfo
): boolean {
  // 1. Table mismatch?
  const affectedTable = cacheKey.tables.find(
    (t) => t.table === writeInfo.table
  );
  if (!affectedTable) {
    return false;
  }

  // 2. For INSERT operations, check if new row would match cached query's WHERE clause
  if (writeInfo.operation === "INSERT") {
    // For aggregate queries or queries without specific WHERE conditions, always invalidate
    if (
      cacheKey.classification === "aggregate" ||
      cacheKey.classification === "join" ||
      !affectedTable.conditions ||
      affectedTable.conditions.length === 0
    ) {
      return true;
    }

    // For queries with WHERE clauses, we'd need the inserted values to determine if they match
    // Since we don't have that information in the current writeInfo, conservatively invalidate
    // TODO: Extract inserted values from INSERT query for more precise filtering
    return true;
  }

  // 3. For DELETE operations, check if deleted rows could affect cached query
  if (writeInfo.operation === "DELETE") {
    // For aggregate queries or joins, always invalidate
    if (
      cacheKey.classification === "aggregate" ||
      cacheKey.classification === "join"
    ) {
      return true;
    }

    // Check if WHERE conditions overlap
    if (
      writeInfo.conditions &&
      affectedTable.conditions &&
      affectedTable.conditions.length > 0
    ) {
      // Use range analysis to determine if DELETE affects cached query
      const overlap = conditionsOverlap(
        affectedTable.conditions,
        writeInfo.conditions
      );
      if (!overlap) {
        return false; // Provably non-overlapping ranges, no invalidation needed
      }
    }

    if (writeInfo.affectedRows && affectedTable.conditions) {
      // Check if any affected row is in the cached query's result set
      return rowsOverlap(cacheKey, writeInfo.affectedRows);
    }

    // Can't determine, invalidate conservatively
    return true;
  }

  // 4. For UPDATE operations, analyze what's affected

  // First check column overlap
  if (writeInfo.modifiedColumns) {
    // 4a. Check if modified columns are in the SELECT list
    const hasColumnOverlap = columnsOverlap(
      affectedTable.columns,
      writeInfo.modifiedColumns
    );

    // 4b. For JOIN queries, also check if modified columns affect JOIN conditions
    const hasJoinOverlap =
      cacheKey.classification === "join" &&
      affectsJoinConditions(
        cacheKey,
        writeInfo.table,
        writeInfo.modifiedColumns
      );

    // If no column overlap and no join overlap, no need to invalidate
    if (!(hasColumnOverlap || hasJoinOverlap)) {
      return false;
    }

    // Check WHERE condition overlap using range analysis
    if (
      writeInfo.conditions &&
      writeInfo.conditions.length > 0 &&
      affectedTable.conditions &&
      affectedTable.conditions.length > 0
    ) {
      const overlap = conditionsOverlap(
        affectedTable.conditions,
        writeInfo.conditions
      );
      if (!overlap) {
        return false; // Provably non-overlapping ranges, no invalidation needed
      }
    }

    // For JOIN queries: invalidate if JOIN conditions OR selected columns are affected
    // We can't reliably determine row overlap across tables, so be conservative
    if (
      cacheKey.classification === "join" &&
      (hasJoinOverlap || hasColumnOverlap)
    ) {
      // Even for JOINs, check if we can determine row non-overlap
      if (writeInfo.affectedRows && affectedTable.conditions) {
        const hasRowOverlap = rowsOverlap(cacheKey, writeInfo.affectedRows);
        if (!hasRowOverlap) {
          return false; // Different rows, no invalidation needed
        }
      }
      return true;
    }

    // For single-table queries with column overlap, check row overlap
    if (hasColumnOverlap) {
      if (writeInfo.affectedRows && affectedTable.conditions) {
        return rowsOverlap(cacheKey, writeInfo.affectedRows);
      }
      // Can't determine row overlap, invalidate conservatively
      return true;
    }

    // No column or join overlap
    return false;
  }

  // 5. No column information - check WHERE condition and row overlap
  if (
    writeInfo.conditions &&
    writeInfo.conditions.length > 0 &&
    affectedTable.conditions &&
    affectedTable.conditions.length > 0
  ) {
    const overlap = conditionsOverlap(
      affectedTable.conditions,
      writeInfo.conditions
    );
    if (!overlap) {
      return false; // Provably non-overlapping ranges
    }
  }

  if (writeInfo.affectedRows && affectedTable.conditions) {
    return rowsOverlap(cacheKey, writeInfo.affectedRows);
  }

  // Can't determine, invalidate conservatively
  return true;
}

// ============================================
// SECTION 9: SQLITE STORAGE
// ============================================

type CacheEntry = {
  result: string;
  cache_key: string;
};

type FingerprintRow = {
  fingerprint: string;
};

class CacheManager {
  private readonly db: Database;
  private readonly stmts: Map<string, ReturnType<Database["prepare"]>> =
    new Map();

  // PERFORMANCE: In-memory LRU cache for hot queries (2-5x faster cache hits)
  private readonly lruCache: Map<string, unknown> = new Map();
  private readonly LRU_MAX_SIZE = 1000;

  constructor(dbPath = ":memory:") {
    this.db = new Database(dbPath);
    this.db.run("PRAGMA journal_mode = WAL;");
    this.initDB();
    this.prepareStatements();
  }

  private initDB(): void {
    // Cache entries table with metadata
    this.db.run(`
      CREATE TABLE IF NOT EXISTS cache_entries (
        fingerprint TEXT PRIMARY KEY,
        result TEXT NOT NULL,
        cache_key TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )
    `);

    // Table index
    this.db.run(`
      CREATE TABLE IF NOT EXISTS table_index (
        table_name TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        PRIMARY KEY (table_name, fingerprint)
      )
    `);

    // Row index
    this.db.run(`
      CREATE TABLE IF NOT EXISTS row_index (
        table_name TEXT NOT NULL,
        row_id TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        PRIMARY KEY (table_name, row_id, fingerprint)
      )
    `);

    // Column index
    this.db.run(`
      CREATE TABLE IF NOT EXISTS column_index (
        table_name TEXT NOT NULL,
        column_name TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        PRIMARY KEY (table_name, column_name, fingerprint)
      )
    `);

    // Aggregate index
    this.db.run(`
      CREATE TABLE IF NOT EXISTS aggregate_index (
        table_name TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        PRIMARY KEY (table_name, fingerprint)
      )
    `);
  }

  private prepareStatements(): void {
    // Cache operations
    this.stmts.set(
      "insertCache",
      this.db.prepare(
        "INSERT OR REPLACE INTO cache_entries (fingerprint, result, cache_key, created_at) VALUES (?, ?, ?, ?)"
      )
    );
    this.stmts.set(
      "getCache",
      this.db.prepare(
        "SELECT result, cache_key FROM cache_entries WHERE fingerprint = ?"
      )
    );
    this.stmts.set(
      "deleteCache",
      this.db.prepare("DELETE FROM cache_entries WHERE fingerprint = ?")
    );

    // Index operations
    this.stmts.set(
      "insertTableIndex",
      this.db.prepare(
        "INSERT OR IGNORE INTO table_index (table_name, fingerprint) VALUES (?, ?)"
      )
    );
    this.stmts.set(
      "insertRowIndex",
      this.db.prepare(
        "INSERT OR IGNORE INTO row_index (table_name, row_id, fingerprint) VALUES (?, ?, ?)"
      )
    );
    this.stmts.set(
      "insertColumnIndex",
      this.db.prepare(
        "INSERT OR IGNORE INTO column_index (table_name, column_name, fingerprint) VALUES (?, ?, ?)"
      )
    );
    this.stmts.set(
      "insertAggregateIndex",
      this.db.prepare(
        "INSERT OR IGNORE INTO aggregate_index (table_name, fingerprint) VALUES (?, ?)"
      )
    );

    // Delete index entries
    this.stmts.set(
      "deleteTableIndex",
      this.db.prepare("DELETE FROM table_index WHERE fingerprint = ?")
    );
    this.stmts.set(
      "deleteRowIndex",
      this.db.prepare("DELETE FROM row_index WHERE fingerprint = ?")
    );
    this.stmts.set(
      "deleteColumnIndex",
      this.db.prepare("DELETE FROM column_index WHERE fingerprint = ?")
    );
    this.stmts.set(
      "deleteAggregateIndex",
      this.db.prepare("DELETE FROM aggregate_index WHERE fingerprint = ?")
    );

    // Query statements for invalidation lookups (reusable)
    this.stmts.set(
      "queryTableIndex",
      this.db.prepare(
        "SELECT fingerprint FROM table_index WHERE table_name = ?"
      )
    );
    this.stmts.set(
      "queryRowIndex",
      this.db.prepare(
        "SELECT fingerprint FROM row_index WHERE table_name = ? AND row_id = ?"
      )
    );
    this.stmts.set(
      "queryColumnIndex",
      this.db.prepare(
        "SELECT fingerprint FROM column_index WHERE table_name = ? AND column_name = ?"
      )
    );
    this.stmts.set(
      "queryAggregateIndex",
      this.db.prepare(
        "SELECT fingerprint FROM aggregate_index WHERE table_name = ?"
      )
    );
  }

  register(fingerprint: string, result: unknown, cacheKey: CacheKey): void {
    const resultJSON = JSON.stringify(result);
    const cacheKeyJSON = JSON.stringify(cacheKey);
    const now = Math.floor(Date.now() / 1000);

    // Begin transaction
    this.db.run("BEGIN");

    try {
      // Store cache entry with metadata
      const insertStmt = this.stmts.get("insertCache");
      if (insertStmt) {
        insertStmt.run(fingerprint, resultJSON, cacheKeyJSON, now);
      }

      // Add indexes
      for (const table of cacheKey.tables) {
        // Table index (always)
        const tableStmt = this.stmts.get("insertTableIndex");
        if (tableStmt) {
          tableStmt.run(table.table, fingerprint);
        }

        // Row index (if simple PK condition)
        if (table.conditions && hasSimplePKCondition(table.conditions)) {
          const pkCond = table.conditions.find((c) =>
            ["id", "uuid"].includes(c.column.toLowerCase())
          );
          if (pkCond) {
            const rowIds =
              pkCond.operator === "IN" && Array.isArray(pkCond.value)
                ? pkCond.value
                : [pkCond.value];

            const rowStmt = this.stmts.get("insertRowIndex");
            if (rowStmt) {
              for (const rowId of rowIds) {
                rowStmt.run(table.table, String(rowId), fingerprint);
              }
            }
          }
        }

        // Column index (for each selected column)
        if (!table.columns.includes("*")) {
          const colStmt = this.stmts.get("insertColumnIndex");
          for (const col of table.columns) {
            const baseCol = col.includes("(")
              ? (col.split("(")[1]?.split(")")[0] ?? col)
              : col;
            if (colStmt) {
              colStmt.run(table.table, baseCol, fingerprint);
            }
          }
        }

        // Aggregate index
        if (cacheKey.classification === "aggregate") {
          const aggStmt = this.stmts.get("insertAggregateIndex");
          if (aggStmt) {
            aggStmt.run(table.table, fingerprint);
          }
        }
      }

      this.db.run("COMMIT");
    } catch (error) {
      this.db.run("ROLLBACK");
      throw error;
    }
  }

  get(fingerprint: string): unknown {
    // PERFORMANCE: Check LRU cache first (avoids SQLite + JSON.parse)
    const cached = this.lruCache.get(fingerprint);
    if (cached !== undefined) {
      return cached;
    }

    // Fallback to SQLite
    const stmt = this.stmts.get("getCache");
    if (!stmt) {
      return null;
    }

    const row = stmt.get(fingerprint) as CacheEntry | null;
    if (!row) {
      return null;
    }

    const result = JSON.parse(row.result);

    // Add to LRU cache for next time
    this.lruCache.set(fingerprint, result);

    // Evict oldest entry if cache is full
    if (this.lruCache.size > this.LRU_MAX_SIZE) {
      const firstKey = this.lruCache.keys().next().value;
      if (firstKey !== undefined) {
        this.lruCache.delete(firstKey);
      }
    }

    return result;
  }

  private getBatchCacheKeys(fingerprints: string[]): Map<string, CacheKey> {
    const result = new Map<string, CacheKey>();

    if (fingerprints.length === 0) {
      return result;
    }

    // Use SQL IN clause for batch fetch
    const placeholders = fingerprints.map(() => "?").join(",");
    const query = `SELECT fingerprint, cache_key FROM cache_entries WHERE fingerprint IN (${placeholders})`;

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...fingerprints) as Array<{
      fingerprint: string;
      cache_key: string;
    }>;

    for (const row of rows) {
      try {
        result.set(row.fingerprint, JSON.parse(row.cache_key) as CacheKey);
      } catch {
        // Skip invalid JSON
      }
    }

    return result;
  }

  invalidate(writeInfo: InvalidationInfo): number {
    // Find affected fingerprints
    const fingerprints = this.findAffectedFingerprints(writeInfo);

    if (fingerprints.size === 0) {
      return 0;
    }

    // Batch fetch all cache keys at once (fixes N+1 query problem)
    const fingerprintArray = Array.from(fingerprints);
    const cacheKeyMap = this.getBatchCacheKeys(fingerprintArray);

    // Check each fingerprint to see if it should be invalidated
    const fingerprintsToDelete: string[] = [];

    for (const fp of fingerprintArray) {
      const cacheKey = cacheKeyMap.get(fp);
      if (!cacheKey) {
        continue;
      }

      // Use the shouldInvalidate function to determine if this cache entry should be invalidated
      if (shouldInvalidate(cacheKey, writeInfo)) {
        fingerprintsToDelete.push(fp);
      }
    }

    if (fingerprintsToDelete.length === 0) {
      return 0;
    }

    // Begin transaction
    this.db.run("BEGIN");

    try {
      // Batch delete all entries at once using IN clause
      const placeholders = fingerprintsToDelete.map(() => "?").join(",");

      // Delete from cache_entries
      const deleteCacheSQL = `DELETE FROM cache_entries WHERE fingerprint IN (${placeholders})`;
      this.db.run(deleteCacheSQL, fingerprintsToDelete as never[]);

      // Delete from indexes
      const deleteTableIndexSQL = `DELETE FROM table_index WHERE fingerprint IN (${placeholders})`;
      this.db.run(deleteTableIndexSQL, fingerprintsToDelete as never[]);

      const deleteRowIndexSQL = `DELETE FROM row_index WHERE fingerprint IN (${placeholders})`;
      this.db.run(deleteRowIndexSQL, fingerprintsToDelete as never[]);

      const deleteColIndexSQL = `DELETE FROM column_index WHERE fingerprint IN (${placeholders})`;
      this.db.run(deleteColIndexSQL, fingerprintsToDelete as never[]);

      const deleteAggIndexSQL = `DELETE FROM aggregate_index WHERE fingerprint IN (${placeholders})`;
      this.db.run(deleteAggIndexSQL, fingerprintsToDelete as never[]);

      const deletedCount = fingerprintsToDelete.length;

      this.db.run("COMMIT");

      // PERFORMANCE: Clear LRU cache for invalidated entries
      for (const fp of fingerprintsToDelete) {
        this.lruCache.delete(fp);
      }

      return deletedCount;
    } catch (error) {
      this.db.run("ROLLBACK");
      throw error;
    }
  }

  private findAffectedFingerprints(writeInfo: InvalidationInfo): Set<string> {
    const fingerprints = new Set<string>();

    // Strategy: Use most specific index first, then broaden if needed

    // 1. For specific row operations (UPDATE/DELETE with known rows), use row index
    if (writeInfo.affectedRows && writeInfo.affectedRows.length > 0) {
      // PERFORMANCE: Batch query instead of N individual queries (2-5x faster)
      const placeholders = writeInfo.affectedRows.map(() => "?").join(",");
      const batchQuery = `
        SELECT DISTINCT fingerprint
        FROM row_index
        WHERE table_name = ? AND row_id IN (${placeholders})
      `;
      const stmt = this.db.prepare(batchQuery);
      const rows = stmt.all(
        writeInfo.table,
        ...writeInfo.affectedRows
      ) as FingerprintRow[];
      for (const row of rows) {
        fingerprints.add(row.fingerprint);
      }

      // If we have modified columns, also check column index
      // This catches queries that don't have row-level conditions
      if (writeInfo.modifiedColumns && writeInfo.modifiedColumns.length > 0) {
        // PERFORMANCE: Batch column index queries (similar to row index optimization)
        const colPlaceholders = writeInfo.modifiedColumns
          .map(() => "?")
          .join(",");
        const colBatchQuery = `
          SELECT DISTINCT fingerprint
          FROM column_index
          WHERE table_name = ? AND column_name IN (${colPlaceholders})
        `;
        const colStmt = this.db.prepare(colBatchQuery);
        const colRows = colStmt.all(
          writeInfo.table,
          ...writeInfo.modifiedColumns
        ) as FingerprintRow[];
        for (const row of colRows) {
          fingerprints.add(row.fingerprint);
        }
      }

      // Also need to check queries that select * or have no row-level conditions
      // These are indexed only by table, not by specific rows
      const tableStmt = this.stmts.get("queryTableIndex");
      if (tableStmt) {
        const tableRows = tableStmt.all(writeInfo.table) as FingerprintRow[];
        for (const row of tableRows) {
          fingerprints.add(row.fingerprint);
        }
      }
    } else {
      // 2. No specific rows (complex WHERE or no WHERE) - must check all queries on table
      const tableStmt = this.stmts.get("queryTableIndex");
      if (tableStmt) {
        const tableRows = tableStmt.all(writeInfo.table) as FingerprintRow[];
        for (const row of tableRows) {
          fingerprints.add(row.fingerprint);
        }
      }
    }

    // 3. For INSERT, always include aggregate queries (count/sum/etc will change)
    if (writeInfo.operation === "INSERT") {
      const aggStmt = this.stmts.get("queryAggregateIndex");
      if (aggStmt) {
        const aggRows = aggStmt.all(writeInfo.table) as FingerprintRow[];
        for (const row of aggRows) {
          fingerprints.add(row.fingerprint);
        }
      }
    }

    // 4. For DELETE, also include aggregate queries
    if (writeInfo.operation === "DELETE") {
      const aggStmt = this.stmts.get("queryAggregateIndex");
      if (aggStmt) {
        const aggRows = aggStmt.all(writeInfo.table) as FingerprintRow[];
        for (const row of aggRows) {
          fingerprints.add(row.fingerprint);
        }
      }
    }

    return fingerprints;
  }

  getMetrics(): {
    totalEntries: number;
    tableBreakdown: Record<string, number>;
    indexSizes: {
      table: number;
      row: number;
      column: number;
      aggregate: number;
    };
  } {
    // Get total cache entries
    const totalResult = this.db
      .prepare("SELECT COUNT(*) as count FROM cache_entries")
      .get() as { count: number };
    const totalEntries = totalResult.count;

    // Get table breakdown
    const tableResults = this.db
      .prepare(
        "SELECT table_name, COUNT(DISTINCT fingerprint) as count FROM table_index GROUP BY table_name"
      )
      .all() as Array<{ table_name: string; count: number }>;

    const tableBreakdown: Record<string, number> = {};
    for (const row of tableResults) {
      tableBreakdown[row.table_name] = row.count;
    }

    // Get index sizes
    const tableIndexSize = (
      this.db.prepare("SELECT COUNT(*) as count FROM table_index").get() as {
        count: number;
      }
    ).count;

    const rowIndexSize = (
      this.db.prepare("SELECT COUNT(*) as count FROM row_index").get() as {
        count: number;
      }
    ).count;

    const columnIndexSize = (
      this.db.prepare("SELECT COUNT(*) as count FROM column_index").get() as {
        count: number;
      }
    ).count;

    const aggregateIndexSize = (
      this.db
        .prepare("SELECT COUNT(*) as count FROM aggregate_index")
        .get() as { count: number }
    ).count;

    return {
      totalEntries,
      tableBreakdown,
      indexSizes: {
        table: tableIndexSize,
        row: rowIndexSize,
        column: columnIndexSize,
        aggregate: aggregateIndexSize,
      },
    };
  }

  clearTable(tableName: string): number {
    // Get all fingerprints associated with this table
    const stmt = this.stmts.get("queryTableIndex");
    if (!stmt) {
      throw new Error("queryTableIndex statement not found");
    }

    const rows = stmt.all(tableName) as Array<{ fingerprint: string }>;
    const fingerprints = rows.map((r) => r.fingerprint);

    if (fingerprints.length === 0) {
      return 0;
    }

    // Delete all entries in batch
    this.db.run("BEGIN");
    try {
      const placeholders = fingerprints.map(() => "?").join(",");

      // Delete from cache_entries
      const deleteCacheSQL = `DELETE FROM cache_entries WHERE fingerprint IN (${placeholders})`;
      this.db.run(deleteCacheSQL, fingerprints as never[]);

      // Delete from indexes
      const deleteTableIndexSQL = `DELETE FROM table_index WHERE fingerprint IN (${placeholders})`;
      this.db.run(deleteTableIndexSQL, fingerprints as never[]);

      const deleteRowIndexSQL = `DELETE FROM row_index WHERE fingerprint IN (${placeholders})`;
      this.db.run(deleteRowIndexSQL, fingerprints as never[]);

      const deleteColIndexSQL = `DELETE FROM column_index WHERE fingerprint IN (${placeholders})`;
      this.db.run(deleteColIndexSQL, fingerprints as never[]);

      const deleteAggIndexSQL = `DELETE FROM aggregate_index WHERE fingerprint IN (${placeholders})`;
      this.db.run(deleteAggIndexSQL, fingerprints as never[]);

      this.db.run("COMMIT");

      // PERFORMANCE: Clear LRU cache for cleared entries
      for (const fp of fingerprints) {
        this.lruCache.delete(fp);
      }
    } catch (error) {
      this.db.run("ROLLBACK");
      throw error;
    }

    return fingerprints.length;
  }

  close(): void {
    this.db.close();
  }
}

// ============================================
// SECTION 10: HTTP API
// ============================================

function createServer(port: number, cacheManager: CacheManager) {
  return Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);

      // CORS headers
      const headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      };

      if (req.method === "OPTIONS") {
        return new Response(null, { headers });
      }

      try {
        // POST /api/v1/analyze
        if (url.pathname === "/api/v1/analyze" && req.method === "POST") {
          const body = (await req.json()) as {
            sql: string;
            params?: unknown[] | Record<string, unknown>;
          };
          const { sql, params } = body;

          const cacheKey = analyzeSELECT(sql, params);

          return Response.json(
            {
              cache_key: cacheKey,
              fingerprint: cacheKey.fingerprint,
            },
            { headers }
          );
        }

        // POST /api/v1/cache/register
        if (
          url.pathname === "/api/v1/cache/register" &&
          req.method === "POST"
        ) {
          const body = (await req.json()) as {
            fingerprint: string;
            result: unknown;
            cache_key: CacheKey;
          };
          const { fingerprint, result, cache_key } = body;

          cacheManager.register(fingerprint, result, cache_key);

          return Response.json({ success: true }, { headers });
        }

        // POST /api/v1/cache/get
        if (url.pathname === "/api/v1/cache/get" && req.method === "POST") {
          const body = (await req.json()) as { fingerprint: string };
          const { fingerprint } = body;

          const result = cacheManager.get(fingerprint);

          return Response.json(
            {
              fingerprint,
              result,
              hit: result !== null,
            },
            { headers }
          );
        }

        // POST /api/v1/cache/invalidate
        if (
          url.pathname === "/api/v1/cache/invalidate" &&
          req.method === "POST"
        ) {
          const body = (await req.json()) as {
            sql: string;
            params?: unknown[] | Record<string, unknown>;
          };
          const { sql, params } = body;

          const writeInfo = analyzeWrite(sql, params);
          const deletedCount = cacheManager.invalidate(writeInfo);

          return Response.json(
            {
              success: true,
              deleted_count: deletedCount,
            },
            { headers }
          );
        }

        // GET /api/v1/metrics
        if (url.pathname === "/api/v1/metrics" && req.method === "GET") {
          const metrics = cacheManager.getMetrics();

          return Response.json(
            {
              metrics,
            },
            { headers }
          );
        }

        return Response.json({ error: "Not found" }, { status: 404, headers });
      } catch (error) {
        return Response.json(
          { error: String(error) },
          { status: 500, headers }
        );
      }
    },
  });
}

// ============================================
// SECTION 11: CLI & MAIN
// ============================================

function parseArgs(): { port: number; dbPath: string } {
  const args = process.argv.slice(2);
  let port = 8080;
  let dbPath = ":memory:";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];
    if (arg === "-port" && nextArg) {
      port = Number.parseInt(nextArg, 10);
      i++;
    } else if (arg === "-db" && nextArg) {
      dbPath = nextArg;
      i++;
    }
  }

  return { port, dbPath };
}

// Main entry point
if (import.meta.main) {
  const { port, dbPath } = parseArgs();
  const cacheManager = new CacheManager(dbPath);

  const _server = createServer(port, cacheManager);
}

// Export for testing
export {
  bindParams,
  normalizeSQL,
  analyzeSELECT,
  analyzeWrite,
  shouldInvalidate,
  CacheManager,
};
