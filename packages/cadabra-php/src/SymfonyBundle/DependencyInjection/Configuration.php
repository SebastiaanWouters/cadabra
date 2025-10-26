<?php

declare(strict_types=1);

namespace Cadabra\SymfonyBundle\DependencyInjection;

use Symfony\Component\Config\Definition\Builder\TreeBuilder;
use Symfony\Component\Config\Definition\ConfigurationInterface;

/**
 * Configuration definition for the Cadabra bundle.
 */
class Configuration implements ConfigurationInterface
{
    public function getConfigTreeBuilder(): TreeBuilder
    {
        $treeBuilder = new TreeBuilder('cadabra');
        $rootNode = $treeBuilder->getRootNode();

        $rootNode
            ->children()
                ->scalarNode('service_url')
                    ->isRequired()
                    ->cannotBeEmpty()
                    ->info('URL of the Cadabra service')
                ->end()
                ->scalarNode('prefix')
                    ->defaultValue('cadabra')
                    ->info('Cache key prefix/namespace')
                ->end()
                ->arrayNode('auto_cache')
                    ->addDefaultsIfNotSet()
                    ->children()
                        ->booleanNode('enabled')
                            ->defaultTrue()
                            ->info('Enable automatic caching')
                        ->end()
                        ->integerNode('default_ttl')
                            ->defaultValue(3600)
                            ->info('Default cache TTL in seconds')
                        ->end()
                        ->arrayNode('heuristics')
                            ->addDefaultsIfNotSet()
                            ->children()
                                ->booleanNode('cache_primary_key_lookups')
                                    ->defaultTrue()
                                    ->info('Cache find(id) queries')
                                ->end()
                                ->booleanNode('cache_simple_where')
                                    ->defaultTrue()
                                    ->info('Cache simple WHERE queries')
                                ->end()
                                ->integerNode('max_join_tables')
                                    ->defaultValue(2)
                                    ->info('Maximum number of joined tables to cache')
                                ->end()
                                ->arrayNode('exclude_keywords')
                                    ->scalarPrototype()->end()
                                    ->defaultValue(['FOR UPDATE', 'LOCK IN SHARE MODE'])
                                    ->info('SQL keywords that prevent caching')
                                ->end()
                                ->arrayNode('exclude_tables')
                                    ->scalarPrototype()->end()
                                    ->defaultValue(['sessions', 'messenger_messages'])
                                    ->info('Tables that should never be cached')
                                ->end()
                            ->end()
                        ->end()
                    ->end()
                ->end()
                ->arrayNode('table_ttls')
                    ->useAttributeAsKey('name')
                    ->scalarPrototype()->end()
                    ->defaultValue([])
                    ->info('Per-table TTL overrides')
                ->end()
            ->end();

        return $treeBuilder;
    }
}
