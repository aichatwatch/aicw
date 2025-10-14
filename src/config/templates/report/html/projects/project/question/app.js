const IS_DEBUG = false;
const GAUGE_TYPE = 'compact'; // 'bar' (original), 'circular' (donut), or 'compact' (number + thin bar)
const FAVICON_32_TEMPLATE = 'https://www.google.com/s2/favicons?domain={{DOMAIN}}&sz=32';
const FAVICON_64_TEMPLATE = 'https://www.google.com/s2/favicons?domain={{DOMAIN}}&sz=64';
const FAVICON_128_TEMPLATE = 'https://www.google.com/s2/favicons?domain={{DOMAIN}}&sz=128';

const DEFAULT_GRAPH_NODE_LIMIT = 12; // Default number of top items to show in graphs
const MIN_CHART_ITEMS = 12; // Maximum number of items to show in charts (link types, domains)
const TOP_INFLUENCERS_COUNT_PER_SECTION = 1; // max of top influencers to show from each entity category

const ENTITES_CONFIG = [
    {
        name: 'products',
        isComputed: false
    },
    {
        name: 'organizations',
        isComputed: false
    },
    {
        name: 'persons',
        isComputed: false
    },
    {
        name: 'keywords',
        isComputed: false
    },
    {
        name: 'places',
        isComputed: false
    },
    {
        name: 'events',
        isComputed: false
    },
    {
        name: 'links',
        isComputed: false
    },
    {
        // this one is computed
        name: 'linkTypes',
        isComputed: true
    },
    {
        // this one is computed
        name: 'linkDomains',
        isComputed: true
    }
]

// returns array of strings with entities names
const ENTITES_NON_COMPUTED = ENTITES_CONFIG.filter(entity => !entity.isComputed).map(entity => entity.name);
// returns array of strings with entities names
const ENTITES_WITH_COMPUTED_DATA = ENTITES_CONFIG.filter(entity => entity.isComputed).map(entity => entity.name);
// returns array of strings with entities names
const ENTITES_ALL = ENTITES_CONFIG.map(entity => entity.name);
// which columns to add "view excerpt" icon
const COLUMNS_WITH_PREVIEW_EXCERPT = ['value'];

function getEntityTableSectionId(entityType) {
    // adding "s" to the end of the entity type to make it plural
    let entityTypePlural = entityType + 's';
    // removing doubled "ss" at the end in case it was already plural
    entityTypePlural = entityTypePlural.replace(/ss$/, 's');
    return `parent_div_for_tabbed_${entityTypePlural}` || null;
}

// Simple event bus for component communication
const EventBus = new Vue();
window.EventBus = EventBus; // Make EventBus globally accessible

// Store pattern for shared state management
const SharedStore = {
    state: {},

    get(key) {
        return this.state[key];
    },

    set(key, value) {
        this.state[key] = value;
        EventBus.$emit(`store:${key}:changed`, value);
    },

    watch(key, callback) {
        EventBus.$on(`store:${key}:changed`, callback);
    },

    unwatch(key, callback) {
        EventBus.$off(`store:${key}:changed`, callback);
    }
};

// Vue mixin for shared graph zoom functionality
const graphZoomMixin = {
    data() {
        return {
            currentZoom: 1 // Current zoom level for graph
        }
    },
    methods: {
        zoomIn() {
            this.setZoom(Math.min(this.currentZoom * 1.2, 4));
        },
        zoomOut() {
            this.setZoom(Math.max(this.currentZoom / 1.2, 0.5));
        },
        zoomReset() {
            this.setZoom(1);
        },
        setZoom(scale) {
            // Get the graph ID from the component's context
            const graphId = this.obj?.graphConfig?.id || this.obj?.id;
            if (!graphId) {
                console.debug('Graph ID not found');
                return;
            }

            const svg = d3.select(`#${graphId} svg`);
            const zoom = this.$parent[`zoom_${graphId}`];

            if (svg.empty() || !zoom) {
                console.debug('Graph SVG or zoom behavior not found');
                return;
            }

            // Get SVG dimensions
            const svgNode = svg.node();
            const width = svgNode.clientWidth || 800;
            const height = svgNode.clientHeight || 600;

            // Apply zoom transform centered on the graph
            svg.transition()
                .duration(300)
                .call(zoom.transform,
                    d3.zoomIdentity
                        .translate(width / 2, height / 2)
                        .scale(scale)
                        .translate(-width / 2, -height / 2)
                );

            this.currentZoom = scale;
        }
    }
};

const DEFAULT_VISUAL_OBJECTS_ARRAY = [
    // Fixed sections at the top    
    {
        title: 'About',
        id: 'about_report',
        type: 'about-report',
        tocPath: '',
        options: [] // list of a object with ids and title like {id: "text_summary", title: "Summary"}. we include objects with non empty title!
    },
    {
        title: '',
        id: 'floating_question_navigator',
        type: 'floating-question-navigator',
        tocPath: '',
    },

    // AI Summary - begin
    // turned off on 2025 oct 14 as it was replaced with "Top Influencers" block
    /*
    {
        title: 'AI Summary',
        description: 'AI summary of the report',
        id: 'text_summary',
        type: 'content-text',
        sourceArrayName: null,
        sourcePropertyName: 'summary',
        hasSearchFilter: false,
        searchFilterFields: [],
        hasModelFilter: false,
        botFilteredFields: [],
        hasAppearanceOrderTrendFilter: true,
        tocPath: 'AI Summary'
    },
    */
    // AI Summary - end

    // Top Influencers - begin
    {
        title: 'Top Influencers',
        id: 'top_influencers',
        type: 'top-influencers',
        tocPath: 'Top Influencers',
        description: 'Top performers across all categories or compare selected items side by side'
    },
    // Top Influencers - end

    // Sections ordered to match left navigation menu

    // events - begin
    {
        title: 'Events',
        description: 'Events mentioned by AI engines',
        id: 'table_events',
        type: 'table-with-items',
        sourceArrayName: 'events',
        columns: [
            { type: 'value', caption: 'Event' },
            { type: 'link', caption: 'Link' },
            { type: 'marked', caption: '✔️' },
            { type: 'influence', caption: 'Voice' },
            { type: 'appearanceOrder', caption: 'Order' },
            { type: 'mentions', caption: 'Mentions' },
            { type: 'modelNames', caption: 'AI Models' }

        ],
        hasSearchFilter: true,
        searchFilterFields: ['value', 'link'],
        hasModelFilter: true,
        botFilteredFields: ['bots'],
        hasAppearanceOrderTrendFilter: true,
        defaultSortingColumn: '',
        defaultSortingDirection: 'desc',
        tocPath: 'Events/Table'

    },
    {
        title: 'Events Graph',
        description: 'Visualization of events mentioned by AI engines',
        id: 'graph_events',
        type: 'graph-with-items',
        sourceArrayName: 'events',
        hasSearchFilter: true,
        columns: [
            { type: 'value', caption: 'Event' },
            { type: 'link', caption: 'Link' },
        ],
        searchFilterFields: ['value', 'link'],
        hasModelFilter: true,
        botFilteredFields: ['bots'],
        hasAppearanceOrderTrendFilter: true,
        defaultSortingColumn: '',
        defaultSortingDirection: 'desc',
        tocPath: 'Events/Graph'
    },
    // events - end
    // keywords - begin     
    {
        title: 'Keywords',
        description: 'Keywords mentioned by AI engines',
        id: 'table_keywords',
        type: 'table-with-items',
        sourceArrayName: 'keywords',
        columns: [
            { type: 'marked', caption: '✔️' },
            { type: 'value', caption: 'Keyword' },
            { type: 'influence', caption: 'Voice' },
            { type: 'appearanceOrder', caption: 'Order' },
            { type: 'mentions', caption: 'Mentions' },
            { type: 'similar', caption: 'Similar', subType2: 'commaSeparated' },            
            { type: 'modelNames', caption: 'AI Models' }

        ],

        hasSearchFilter: true,
        searchFilterFields: ['value'],
        hasModelFilter: true,
        botFilteredFields: ['bots'],
        hasAppearanceOrderTrendFilter: true,
        defaultSortingColumn: '',
        defaultSortingDirection: 'desc',
        tocPath: 'Keywords/Table'

    },
    {
        title: 'Keywords Graph',
        description: 'Visualization of keywords mentioned by AI engines',
        id: 'graph_keywords',
        type: 'graph-with-items',
        sourceArrayName: 'keywords',
        hasSearchFilter: true,
        searchFilterFields: ['value'],
        hasModelFilter: true,
        botFilteredFields: ['bots'],
        hasAppearanceOrderTrendFilter: true,
        defaultSortingColumn: '',
        defaultSortingDirection: 'desc',
        tocPath: 'Keywords/Graph'

    },
    // keywords - end

    // organizations - begin
    {
        title: 'Organizations',
        description: 'Organizations mentioned and used by AI engines',
        id: 'table_organizations',
        type: 'table-with-items',
        sourceArrayName: 'organizations',
        columns: [
            { type: 'marked', caption: '✔️' },
            { type: 'value', caption: 'Organization' },
            { type: 'link', caption: 'Link' },            
            { type: 'influence', caption: 'Voice' },
            { type: 'appearanceOrder', caption: 'Order' },
            { type: 'mentions', caption: 'Mentions' },
            { type: 'modelNames', caption: 'AI Models' }

        ],
        hasSearchFilter: true,
        searchFilterFields: ['value', 'link'],
        hasModelFilter: true,
        botFilteredFields: ['bots'],
        hasAppearanceOrderTrendFilter: true,
        defaultSortingColumn: '',
        defaultSortingDirection: 'desc',
        tocPath: 'Organizations/Table'
    },
    {
        title: 'Organizations Graph',
        description: 'Visualization of organizations mentioned and used by AI engines',
        id: 'graph_organizations',
        type: 'graph-with-items',
        sourceArrayName: 'organizations',
        hasSearchFilter: true,
        columns: [
            { type: 'value', caption: 'Company Name' },
            { type: 'link', caption: 'Company Website' },
        ],
        searchFilterFields: ['value', 'link'],
        hasModelFilter: true,
        botFilteredFields: ['bots'],
        hasAppearanceOrderTrendFilter: true,
        defaultSortingColumn: '',
        defaultSortingDirection: 'desc',
        tocPath: 'Organizations/Graph'
    },
    // organizations - end
    // persons - begin
    {
        title: 'Persons',
        description: 'Persons mentioned by AI engines',
        id: 'table_persons',
        type: 'table-with-items',
        sourceArrayName: 'persons',
        columns: [
            { type: 'marked', caption: '✔️' },
            { type: 'influence', caption: 'Voice' },
            { type: 'appearanceOrder', caption: 'Order' },
            { type: 'mentions', caption: 'Mentions' },
            { type: 'value', caption: 'Person' },
            { type: 'link', caption: 'Link' },
            { type: 'modelNames', caption: 'AI Models' }

        ],
        hasSearchFilter: true,
        searchFilterFields: ['value', 'link'],
        hasModelFilter: true,
        botFilteredFields: ['bots'],
        hasAppearanceOrderTrendFilter: true,
        defaultSortingColumn: '',
        defaultSortingDirection: 'desc',
        tocPath: 'Persons/Table'

    },
    {
        title: 'Persons Graph',
        description: 'Visualization of persons mentioned by AI engines',
        id: 'graph_persons',
        type: 'graph-with-items',
        sourceArrayName: 'persons',
        hasSearchFilter: true,
        columns: [
            { type: 'value', caption: 'Person' },
            { type: 'link', caption: 'Link' },
        ],
        searchFilterFields: ['value', 'link'],
        hasModelFilter: true,
        botFilteredFields: ['bots'],
        hasAppearanceOrderTrendFilter: true,
        defaultSortingColumn: '',
        defaultSortingDirection: 'desc',
        tocPath: 'Persons/Graph'
    },
    // persons - end

    // places - begin       
    {
        title: 'Places',
        description: 'Places mentioned by AI engines',
        id: 'table_places',
        type: 'table-with-items',
        sourceArrayName: 'places',
        columns: [
            { type: 'marked', caption: '✔️' },
            { type: 'value', caption: 'Place' },
            { type: 'link', caption: 'Link' },            
            { type: 'influence', caption: 'Voice' },
            { type: 'appearanceOrder', caption: 'Order' },
            { type: 'mentions', caption: 'Mentions' },
            { type: 'modelNames', caption: 'AI Models' }

        ],
        hasSearchFilter: true,
        searchFilterFields: ['value', 'link'],
        hasModelFilter: true,
        botFilteredFields: ['bots'],
        hasAppearanceOrderTrendFilter: true,
        defaultSortingColumn: '',
        defaultSortingDirection: 'desc',
        tocPath: 'Places/Table'

    },
    {
        title: 'Places Graph',
        description: 'Visualization of places mentioned by AI engines',
        id: 'graph_places',
        type: 'graph-with-items',
        sourceArrayName: 'places',
        hasSearchFilter: true,
        columns: [
            { type: 'value', caption: 'Place' },
            { type: 'link', caption: 'Link' },
        ],
        searchFilterFields: ['value', 'link'],
        hasModelFilter: true,
        botFilteredFields: ['bots'],
        hasAppearanceOrderTrendFilter: true,
        defaultSortingColumn: '',
        defaultSortingDirection: 'desc',
        tocPath: 'Places/Graph'
    },
    // places - end

    // products - begin
    {
        title: 'Products',
        description: 'Products mentioned and used by AI engines',
        id: 'table_products',
        type: 'table-with-items',
        sourceArrayName: 'products',
        columns: [
            { type: 'marked', caption: '✔️' },
            { type: 'value', caption: 'Product' },
            { type: 'link', caption: 'Link' },            
            { type: 'influence', caption: 'Voice' },
            { type: 'appearanceOrder', caption: 'Order' },
            { type: 'mentions', caption: 'Mentions' },
            { type: 'modelNames', caption: 'AI Models' }

        ],
        hasSearchFilter: true,
        searchFilterFields: ['value', 'link'],
        hasModelFilter: true,
        botFilteredFields: ['bots'],
        hasAppearanceOrderTrendFilter: true,
        defaultSortingColumn: '',
        defaultSortingDirection: 'desc',
        tocPath: 'Products/Table'
    },
    {
        title: 'Products Graph',
        description: 'Visualization of products mentioned and used by AI engines',
        id: 'graph_products',
        type: 'graph-with-items',
        sourceArrayName: 'products',
        hasSearchFilter: true,
        columns: [
            { type: 'value', caption: 'Product' },
            { type: 'link', caption: 'Link' },
        ],
        searchFilterFields: ['value', 'link'],
        hasModelFilter: true,
        botFilteredFields: ['bots'],
        hasAppearanceOrderTrendFilter: true,
        defaultSortingColumn: '',
        defaultSortingDirection: 'desc',
        tocPath: 'Products/Graph'
    },
    // products - end

    // links - begin
    {
        title: 'Links',
        description: 'Links mentioned and used by AI engines',
        id: 'table_links',
        type: 'table-with-items',
        sourceArrayName: 'links',
        columns: [
            { type: 'marked', caption: '✔️' },
            { type: 'link', caption: 'Link' },
            { type: 'linkType', caption: 'Type' },            
            { type: 'influence', caption: 'Voice' },
            { type: 'appearanceOrder', caption: 'Order' },
            { type: 'mentions', caption: 'Mentions' },
            //{type: 'value', caption: 'Value'},
            { type: 'modelNames', caption: 'AI Models' }

        ],
        hasSearchFilter: true,
        searchFilterFields: ['link'],
        hasModelFilter: true,
        botFilteredFields: ['bots'],
        hasAppearanceOrderTrendFilter: true,
        defaultSortingColumn: '',
        defaultSortingDirection: 'desc',
        tocPath: 'Links/Table'
    },
    {
        title: 'Links Graph',
        description: 'Visualization of links mentioned and used by AI engines',
        id: 'graph_links',
        type: 'graph-with-items',
        sourceArrayName: 'links',
        columns: [
            { type: 'link', caption: 'Link' },

            { type: 'influence', caption: 'Voice' },

        ],
        hasSearchFilter: true,
        searchFilterFields: ['link'],
        hasModelFilter: true,
        botFilteredFields: ['bots'],
        hasAppearanceOrderTrendFilter: true,
        defaultSortingColumn: '',
        defaultSortingDirection: 'desc',
        tocPath: 'Links/Graph'
    },

    // links - end

    // linkTypes - begin
    {
        title: 'Link Types',
        description: 'Source types mentioned and used by AI engines',
        id: 'table_linkTypes',
        type: 'table-with-items',
        sourceArrayName: 'linkTypes',
        columns: [
            { type: 'marked', caption: '✔️' },
            { type: 'value', caption: 'Type' },            
            { type: 'influence', caption: 'Voice' },
            { type: 'appearanceOrder', caption: 'Order' },
            { type: 'mentions', caption: 'Mentions' },
            { type: 'modelNames', caption: 'AI Models' }

        ],
        hasSearchFilter: true,
        searchFilterFields: ['value'],
        hasModelFilter: true,
        botFilteredFields: ['bots'],
        hasAppearanceOrderTrendFilter: true,
        defaultSortingColumn: '',
        defaultSortingDirection: 'desc',
        tocPath: 'Link Types/Table'

    },
    {
        title: 'Link Types Graph',
        description: 'Visualization of source types mentioned and used by AI engines',
        id: 'graph_linkTypes',
        type: 'graph-with-items',
        sourceArrayName: 'linkTypes',
        hasSearchFilter: true,
        searchFilterFields: ['value'],
        hasModelFilter: true,
        botFilteredFields: ['bots'],
        hasAppearanceOrderTrendFilter: true,
        hasTrendFilter: true,
        defaultSortingColumn: 'positive',
        defaultSortingDirection: 'desc',
        tocPath: 'Link Types/Graph'

    },

    {
        title: 'Link Type by Influence',
        description: 'Chart of source types by influence',
        id: 'chart_linkTypesByInfluence',
        type: 'chart-with-items',
        sourceArrayName: 'linkTypes',
        chartSpecificConfig: {
            chartType: 'horizontalBar',
            formatAsPercentage: true  // This will format values as percentages
        },
        columns: [
            // first is always the category
            { type: 'value', caption: 'Link Type', chartAxis: 'x' },
            { type: 'influence', caption: 'Influence', chartAxis: 'y' }
        ],
        hasSearchFilter: true,
        searchFilterFields: ['value'],
        hasModelFilter: true,
        botFilteredFields: ['bots'],
        hasAppearanceOrderTrendFilter: true,
        hasTrendFilter: true,
        defaultSortingColumn: '',
        defaultSortingDirection: 'desc',
        tocPath: 'Link Types/Influence Chart'
    },    
    {
        title: 'Link Type by Mentions',
        description: 'Chart of source types by mentions',
        id: 'chart_linkTypesByMentions',
        type: 'chart-with-items',
        sourceArrayName: 'linkTypes',
        chartSpecificConfig: {
            chartType: 'horizontalBar',
            formatValuesAsPercentage: false  // This will format values as percentages
        },
        columns: [
            // first is always the category
            { type: 'value', caption: 'Link Type', chartAxis: 'x' },
            { type: 'mentions', caption: 'Mentions', chartAxis: 'y' }
        ],
        hasSearchFilter: true,
        searchFilterFields: ['value'],
        hasModelFilter: true,
        botFilteredFields: ['bots'],
        hasAppearanceOrderTrendFilter: true,
        hasTrendFilter: true,
        defaultSortingColumn: 'mentions',
        defaultSortingDirection: 'desc',
        tocPath: 'Link Types/Mentions Chart'

    },
    // link types - end    

    // linkDomains - begin
    {
        title: 'Link Domains',
        description: 'Domains mentioned and used by AI engines',
        id: 'table_linkDomains',
        type: 'table-with-items',
        sourceArrayName: 'linkDomains',
        columns: [
            { type: 'marked', caption: '✔️' },
            { type: 'link', caption: 'Domain' },
            { type: 'linkTypeName', caption: 'Type' },
            { type: 'influence', caption: 'Voice' },
            { type: 'appearanceOrder', caption: 'Order' },
            { type: 'mentions', caption: 'Mentions' },
            { type: 'modelNames', caption: 'AI Models' }

        ],
        hasSearchFilter: true,
        searchFilterFields: ['value'],
        hasModelFilter: true,
        botFilteredFields: ['bots'],
        hasAppearanceOrderTrendFilter: true,
        defaultSortingColumn: '',
        defaultSortingDirection: 'desc',
        tocPath: 'Link Domains/Table'

    },
    {
        title: 'Link Domains Graph',
        description: 'Visualization of domains mentioned and used by AI engines',
        id: 'graph_linkDomains',
        type: 'graph-with-items',
        sourceArrayName: 'linkDomains',
        hasSearchFilter: true,
        searchFilterFields: ['value'],
        hasModelFilter: true,
        botFilteredFields: ['bots'],
        hasAppearanceOrderTrendFilter: true,
        hasTrendFilter: true,
        defaultSortingColumn: 'positive',
        defaultSortingDirection: 'desc',
        tocPath: 'Link Domains/Graph'

    },

    {
        title: 'Link Domains by Influence',
        description: 'Chart of domains by influence',
        id: 'chart_linkDomainsByInfluence',
        type: 'chart-with-items',
        sourceArrayName: 'linkDomains',
        chartSpecificConfig: {
            chartType: 'horizontalBar',
            formatAsPercentage: true
        },
        columns: [
            // first is always the category
            { type: 'value', caption: 'Domain', chartAxis: 'x' },
            { type: 'influence', caption: 'Influence', chartAxis: 'y' }
        ],
        hasSearchFilter: true,
        searchFilterFields: ['value'],
        hasModelFilter: true,
        botFilteredFields: ['bots'],
        hasAppearanceOrderTrendFilter: true,
        hasTrendFilter: true,
        defaultSortingColumn: '',
        defaultSortingDirection: 'desc',
        tocPath: 'Link Domains/Influence Chart'
    },

    {
        title: 'Link Domains by Mentions',
        description: 'Chart of domains by mentions',
        id: 'chart_linkDomainsByMentions',
        type: 'chart-with-items',
        sourceArrayName: 'linkDomains',
        chartSpecificConfig: {
            chartType: 'horizontalBar',
            formatValuesAsPercentage: false
        },
        columns: [
            // first is always the category
            { type: 'value', caption: 'Domain', chartAxis: 'x' },
            { type: 'mentions', caption: 'Mentions', chartAxis: 'y' }
        ],
        hasSearchFilter: true,
        searchFilterFields: ['value'],
        hasModelFilter: true,
        botFilteredFields: ['bots'],
        hasAppearanceOrderTrendFilter: true,
        hasTrendFilter: true,
        defaultSortingColumn: 'mentions',
        defaultSortingDirection: 'desc',
        tocPath: 'Link Domains/Mentions Chart'

    },
    // link domains - end


];

function get_DEFAULT_VISUAL_OBJECTS_ARRAY() {
    // set default for defaultSortingColumn to 'influence'
    return DEFAULT_VISUAL_OBJECTS_ARRAY.map(item => {
        return {
            ...item,
            defaultSortingColumn: item.defaultSortingColumn ? item.defaultSortingColumn : 'influence',
            defaultSortingDirection: item.defaultSortingDirection ? item.defaultSortingDirection : 'desc'
        }
    });
}
// for use in combobox-select component
// and to check selection option
const ERROR_VALUE = '!!ERROR!!';
const NA_VALUE_CAPTION = 'N/A';
const NA_VALUE_HTML_FOR_CELL = `<span class="text-gray-300 text-sm muted">N/A</span>`;

const VISIBLE_COUNT_BY_DEFAULT_IN_PERCENTS = 30;
const VISIBLE_COUNT_BY_DEFAULT_HARD_MIN_LIMIT = 3;
const VISIBLE_COUNT_BY_DEFAULT_MAX = 12; // Maximum items to show initially

const URL_DETECTION_PATTERN = /^(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+\.(?:[a-zA-Z]{2,}))(?:\/[a-zA-Z0-9-]+)*(?:\/[a-zA-Z0-9-]+(?:-[a-zA-Z0-9]+)*)?$/;

// max non truncated string length for values, links, in tables, titles for hints
const MAX_NON_TRUNCATED_STRING_LENGTH = 60;

const TREND_SIGNIFICANT_CHANGE_THRESHOLD = 0.3; // 10% change is considered significant

const TRENDS = Object.freeze({
    UP: 10, // "↑"
    DOWN: -1, // "↓"
    STABLE: 1, // "→"
    NEW: 999, // "🆕"
    DISAPPEARED: -99, // "x"
    FLUCTUATING: 0, // "↔"
    UNKNOWN: -9999, // "?"
});

const NUMERIC_COLUMN_HEADERS = [
    'appearanceOrder', 
    'mentions',
    'influence',
    'positive', 
    'neutral', 
    'negative'
];

// Constants for default densities
const DEFAULT_KEYWORD_DENSITY = 1;  // 50 is the middle of the slider
const DEFAULT_LINK_DENSITY = 1;     // 50 is the middle of the slider
const DEFAULT_COMPANY_DENSITY = 1; // 50 is the middle of the slider
const GRAPH_BOT_SIZE = 48; // New constant for bot size
const GRAPH_BOT_CLASSES = "has-data-hint";
const GRAPH_SCALING_FACTOR_ON_MOBILE = 2;
const GRAPH_LINK_THICKNESS = 1.5; // Increase this value to make lines thicker (default was likely 1)
const GRAPH_NODE_COLORS = [
    // Primary colors
    '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF',

    // Orange shades
    '#FF8000', '#FFA500', '#FF6600',

    // Pink/Purple shades  
    '#FF0080', '#FF69B4', '#DA70D6', '#8A2BE2',

    // Green shades
    '#80FF00', '#32CD32', '#98FB98', '#00FA9A',

    // Blue shades
    '#0080FF', '#4169E1', '#1E90FF', '#87CEEB',

    // Red/Orange shades
    '#FF4500', '#FF6347', '#FF7F50', '#FFA07A',

    // Softer mixed colors
    '#FF8080', '#80FF80', '#8080FF', '#FFFF80', '#FFB6C1',
    '#98FB98', '#87CEFA', '#DDA0DD', '#F0E68C', '#E6E6FA'
];

const GRAPH_BOT_CORNER_RADIUS = 10; // Adjust this value to change the roundness of corners
const GRAPH_BOT_DISAPPERED_DEFAULT_CALCULATED_SIZE = 0.01; // default calculated size of disappered item in graphs
const GRAPH_BOT_DISAPPERED_FILL_COLOR = '#CCCCCC';

const MAX_LINK_CAPTION_LENGTH = 42; // max lenght of link caption in link graph 

const baseProps = {
    // Fix inheritance structure
    name: 'base-props',
    props: {
        obj: {
            type: Object,
            required: true,
            validator(obj) {
                return obj && obj.id; // Validate required fields
            }
        }
    },
    computed: {
        getObjectId() {
            return this.obj?.id || 'ERROR';
        },
        feedbackLink() {
            return `https://github.com/aichatwatch/aicw/issues`;
        }
    },
    methods: {
        getDaySpan() {
            if (!this.$root.totalDates || this.$root.totalDates.length < 2) return 1;
            const dates = this.$root.totalDates.map(d => new Date(d));
            const minDate = new Date(Math.min(...dates));
            const maxDate = new Date(Math.max(...dates));
            const diffTime = Math.abs(maxDate - minDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return diffDays + 1; // Include both start and end dates
        },
        formatDateShort(dateStr) {
            if (!dateStr) return '';
            const date = new Date(dateStr);
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            return `${months[date.getMonth()]} ${date.getDate()}`;
        },
        getDataFrequency() {
            if (!this.$root.totalDates || this.$root.totalDates.length < 2) return null;
            const daySpan = this.getDaySpan();
            const dataPoints = this.$root.totalDates.length;

            if (dataPoints >= daySpan * 0.8) {
                return 'Daily monitoring';
            } else if (dataPoints >= daySpan / 7 * 0.8) {
                return 'Weekly monitoring';
            } else if (dataPoints >= daySpan / 14 * 0.8) {
                return 'Bi-weekly monitoring';
            } else if (dataPoints >= daySpan / 30 * 0.8) {
                return 'Monthly monitoring';
            } else {
                const avgDays = Math.round(daySpan / dataPoints);
                return `Every ~${avgDays} days`;
            }
        },
        extractDomain(url) {
            try {
                if (!url.toLowerCase().includes('http')) {
                    url = 'http://' + url;
                }
                const urlObj = new URL(url);
                return urlObj.hostname.replace(/^www\./, '');
            } catch (e) {
                // If URL is invalid, return the original string
                try {
                    return String(url)
                        .replace(/^https?:\/\/(www\.)?/i, '')
                        .replace(/^www\./i, '')
                        .split(/[\/#?]/, 1)[0];
                }
                catch (e) {
                    console.warn(`Invalid URL: ${url}`);
                    return String(url);
                }
            }
        },
        formatUsers(count) {
            if (count >= 1000000000) return (count / 1000000000).toFixed(1) + 'B';
            if (count >= 1000000) return (count / 1000000).toFixed(1) + 'M';
            if (count >= 1000) return (count / 1000).toFixed(1) + 'K';
            return count.toString();
        }
    }
};

Vue.component('base-component', {
    name: 'base-component',
    extends: baseProps,
    template: `
    <div :id="'parent_div_for_' + getObjectId">
        <slot></slot>
    </div>        
    `
});

Vue.component('base-section-component', {
    name: 'base-section-component',
    extends: baseProps,
    props: {
        sectionTitle: {
            type: String,
            default: ''
        },
        hasExportLink: {
            type: Boolean,
            default: false
        },
        exportHandler: {
            type: Function,
            default: null
        },
        isEmptySection: {
            type: Boolean,
            default: false
        }
    },
    template: `
    <div :id="'parent_div_for_' + getObjectId" :class="['section', 'bg-white', 'dark:bg-gray-800', 'rounded-lg', 'shadow-md', 'dark:shadow-gray-900', 'mb-4', isEmptySection ? 'p-2' : 'p-4']">
        <!-- Consolidated single-line header -->
        <div :class="[isEmptySection ? 'mb-0 pb-2' : 'mb-4 pb-3', 'border-b', 'border-gray-200', 'dark:border-gray-700']">
            <div class="flex items-center justify-between">
                <!-- Left: Section title with arrow -->
                <div class="flex items-center gap-2">
                    <a v-if="sectionTitle"
                       href="#"
                       title="Return to table of contents"
                       @click.prevent="$root.scrollToElement('parent_div_for_about_report')"
                       class="text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition duration-300">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                        </svg>
                    </a>
                    <h2 v-if="sectionTitle" class="text-xl font-semibold">
                        {{ sectionTitle }}
                        <span v-if="isEmptySection" class="text-sm text-gray-500 dark:text-gray-400 ml-2 font-normal">- zero items detected</span>
                    </h2>
                </div>

                <!-- Center: Switch and Report type -->
                <div class="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <a href='#' @click="showReportSelector"
                            class="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-500 transition-colors flex items-center gap-1 bg-transparent border-0">
                        <span class="fa fa-exchange-alt"></span>
                        <span>Switch</span>
                    </a>
                    <span class="text-gray-400">|</span>
                    <template v-if="$root.reportMetadata && $root.reportMetadata.isAggregateReport">
                        📊 Aggregated ({{ $root.reportMetadata.totalQuestions }} questions)
                    </template>
                    <template v-else>
                        📝 Question: {{ $root.report_question }}
                    </template>
                </div>

                <!-- Right: Export link -->
                <div v-if="hasExportLink" class="text-right">
                    <a href="#" @click.prevent="handleExport"
                        class="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm">
                        → to csv
                    </a>
                </div>
            </div>
        </div>
        <slot v-if="!isEmptySection"></slot>
        <!-- section footer section BEGIN -->
          <!-- section footer section END -->
    </div>
    `,
    methods: {
        showReportSelector() {
            if (EventBus) {
                EventBus.$emit('show-report-selector');
            }
        },
        handleExport() {
            if (this.exportHandler) {
                this.exportHandler();
            } else if (this.obj && this.obj.tableConfig && this.$parent.exportTable) {
                this.$parent.exportTable(this.obj.tableConfig.id);
            }
        }
    }
});


Vue.component('floating-question-navigator', {
    template: `
        <div v-if="hasQuestions">
            <!-- Floating Action Button -->
            <div class="fixed bottom-20 sm:bottom-6 right-6 z-40">
                <button @click="showNavigator = !showNavigator"
                        class="bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600 text-white rounded-full w-14 h-14 shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center group">
                    <span class="absolute -top-1 -right-1 bg-red-500 dark:bg-red-400 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                        {{ totalQuestionsCount }}
                    </span>
                    <svg class="w-6 h-6 transition-transform duration-200" :class="showNavigator ? 'rotate-45' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span class="absolute right-full mr-3 bg-gray-900 text-white text-sm px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                        Switch Report
                    </span>
                </button>
            </div>

            <!-- Question Navigator Modal -->
            <transition name="fade">
                <div v-if="showNavigator" @click.self="showNavigator = false"
                     class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                    <div class="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-[80vh] flex flex-col shadow-2xl">
                        <!-- Header -->
                        <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                            <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">Switch Report</h3>
                            <button @click="showNavigator = false"
                                    class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <!-- Search Bar -->
                        <div class="px-6 py-3 border-b border-gray-200 dark:border-gray-700">
                            <div class="relative">
                                <input v-model="searchQuery"
                                       ref="searchInput"
                                       type="text"
                                       placeholder="Search reports..."
                                       class="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                                <svg class="absolute left-3 top-2.5 w-5 h-5 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            </div>
                        </div>

                        <!-- Questions List -->
                        <div class="flex-1 overflow-y-auto px-6 py-4">
                            <div class="space-y-2">
                                <a v-for="question in filteredQuestions"
                                   :key="question.id"
                                   :href="question.reportUrl"
                                   :class="[
                                       'block p-3 rounded-lg transition-colors border',
                                       question.isActive
                                           ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700'
                                           : 'bg-gray-50 dark:bg-gray-700/50 hover:bg-blue-50 dark:hover:bg-blue-900/30 border-gray-200 dark:border-gray-600 hover:border-blue-200 dark:hover:border-blue-700'
                                   ]">
                                    <div class="flex items-start gap-3">
                                        <span v-if="question.isProjectsLink" class="flex-shrink-0 inline-flex items-center justify-center w-8 h-8 text-sm font-bold bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded-full">
                                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                            </svg>
                                        </span>
                                        <span v-else-if="question.number !== 'all'" class="flex-shrink-0 inline-flex items-center justify-center w-8 h-8 text-sm font-bold bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full">
                                            {{ question.number }}
                                        </span>
                                        <span v-else class="flex-shrink-0 inline-flex items-center justify-center w-8 h-8 text-sm font-bold bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded-full">
                                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
                                            </svg>
                                        </span>
                                        <div class="flex-1">
                                            <p class="text-gray-900 dark:text-gray-100 font-medium">{{ question.text }}</p>
                                            <div v-if="question.answerCount" class="mt-1 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                                                <span class="flex items-center gap-1">
                                                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                                                    </svg>
                                                    {{ question.answerCount }} {{ question.answerCount === 1 ? 'answer' : 'answers' }}
                                                </span>
                                            </div>
                                            <div v-if="question.isActive" class="mt-1 text-xs text-blue-600 dark:text-blue-400 font-semibold">
                                                Current Report
                                            </div>
                                        </div>
                                        <svg class="flex-shrink-0 w-5 h-5 text-blue-500 dark:text-blue-400 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                        </svg>
                                    </div>
                                </a>
                            </div>

                            <div v-if="filteredQuestions.length === 0" class="text-center py-8 text-gray-500 dark:text-gray-400">
                                No reports found matching "{{ searchQuery }}"
                            </div>
                        </div>
                    </div>
                </div>
            </transition>
        </div>
    `,
    data() {
        return {
            showNavigator: false,
            searchQuery: ''
        };
    },
    computed: {
        isAggregateReport() {
            return this.$root.report_type === 'aggregate';
        },
        hasQuestions() {
            return this.allQuestions.length > 0;
        },
        totalQuestionsCount() {
            // Subtract 2 to exclude both "View All Projects" and "All Questions" options from count
            return Math.max(0, this.allQuestions.length - 2);
        },
        allQuestions() {
            // Extract project name from URL path
            const pathParts = window.location.pathname.split('/').filter(p => p);
            // Find the project name - it's after 'projects' in the path
            const projectsIndex = pathParts.indexOf('projects');
            const projectName = projectsIndex >= 0 && projectsIndex < pathParts.length - 1
                ? pathParts[projectsIndex + 1].replace(/_/g, ' ')
                : 'Project';

            // Determine the correct path to all projects index based on report type
            // Aggregate reports are 3 levels deep, individual questions are 4 levels deep
            const allProjectsPath = this.isAggregateReport ? '../../../index.html' : '../../../../index.html';

            // For aggregate reports
            if (this.isAggregateReport) {
                const questions = this.$root.questionsData?.questions || [];

                // Add "View All Projects" and "All Questions" at the beginning
                return [
                    {
                        id: 'all-projects',
                        number: 'projects',
                        text: 'Explore All Projects',
                        reportUrl: allProjectsPath,
                        isActive: false,
                        isProjectsLink: true
                    },
                    {
                        id: 'all-questions',
                        number: 'all',
                        text: `[Aggregate - All Questions] ${projectName}`,
                        reportUrl: './index.html',
                        isActive: true
                    },
                    ...questions.map(q => ({
                        ...q,
                        isActive: false
                    }))
                ];
            }

            // For individual question reports, build the list
            // Get current question from URL or report data
            const currentPath = window.location.pathname;
            const currentPathParts = currentPath.split('/').filter(p => p);
            const currentQuestionDir = currentPathParts[currentPathParts.length - 1] || '';

            // Common project questions structure (you can expand this based on your needs)
            const projectQuestions = [
                { id: '1-what-are-the-best-ci', number: 1, text: 'What are the best cities for nomads?' },
                { id: '2-which-cities-are-the', number: 2, text: 'Which cities are the best for nomads?' },
                { id: '3-best-place-to-work-f', number: 3, text: 'Best place to work from on planet for nomads in 2025?' },
                { id: '4-top-25-places-for-no', number: 4, text: 'Top 25 locations for nomads to live and work in 2025' },
                { id: '5-recommend-best-place', number: 5, text: 'Recommend best locations for nomad to work and live' }
            ];

            const result = [
                {
                    id: 'all-projects',
                    number: 'projects',
                    text: 'Explore All Projects',
                    reportUrl: allProjectsPath,
                    isActive: false,
                    isProjectsLink: true
                },
                {
                    id: 'all-questions',
                    number: 'all',
                    text: `[Aggregate - All Questions] ${projectName}`,
                    reportUrl: '../index.html',
                    isActive: false
                }
            ];

            // Add individual questions
            projectQuestions.forEach(q => {
                result.push({
                    ...q,
                    reportUrl: `../${q.id}/index.html`,
                    answerCount: 7, // Default value, can be made dynamic
                    isActive: currentQuestionDir === q.id
                });
            });

            return result;
        },
        filteredQuestions() {
            let questions = [...this.allQuestions];

            if (this.searchQuery) {
                const search = this.searchQuery.toLowerCase();
                questions = questions.filter(q =>
                    q.text.toLowerCase().includes(search) ||
                    (q.id && q.id.toLowerCase().includes(search)) ||
                    (q.number && q.number.toString().includes(search))
                );
            }

            return questions;
        }
    },
    watch: {
        showNavigator(val) {
            if (val) {
                this.$nextTick(() => {
                    this.$refs.searchInput?.focus();
                });
            }
        }
    },
    mounted() {
        // Listen for events from other components to show the navigator
        EventBus.$on('show-report-selector', () => {
            this.showNavigator = true;
        });
    },
    beforeDestroy() {
        EventBus.$off('show-report-selector');
    }
});

Vue.component('about-report', {
    extends: baseProps,
    data() {
        return {
            tocSectionExpanded: localStorage.getItem('tocSectionExpanded') !== 'false', // Default to true
            dataSectionExpanded: localStorage.getItem('dataSectionExpanded') === 'false', // Default to false
            questionsExpanded: true, // Default to expanded for easy access
            questionSearch: '' // Search query for questions
        }
    },
    watch: {
        tocSectionExpanded(val) {
            localStorage.setItem('tocSectionExpanded', val);
        },
        dataSectionExpanded(val) {
            localStorage.setItem('dataSectionExpanded', val);
        }
    },
    template: `
    <base-section-component :obj="obj">
      <!-- Main Header -->
      <div class="mb-8 text-center">
            <h1 class="text-4xl sm:text-5xl md:text-6xl font-extrabold mb-2 text-gray-800 dark:text-gray-100 leading-tight">
                {{ $root.report_title || $root.report_question }}
            </h1>
            <p v-if="$root.report_type === 'aggregate'" class="text-gray-500 dark:text-gray-400 text-lg mb-4">
                Comprehensive Analysis Across All Questions
            </p>

            <!-- Enhanced Date Display -->
            <div v-if="$root.totalDates && $root.totalDates.length > 0" class="mt-4 inline-flex flex-col items-center">
                <div v-if="$root.totalDates.length === 1" class="text-gray-600 dark:text-gray-300 text-sm">
                    <span class="font-medium">Data captured on:</span> {{ $root.dateToString($root.report_date) }}
                    <br/>
                    <span class="font-medium">Report generated on:</span> {{ $root.dateToString($root.created_at) }}
                </div>
                <div v-else class="space-y-2">
                    <div class="text-gray-600 dark:text-gray-300 text-sm">
                        <span class="font-medium">{{ $root.totalDates.length }} data points</span> captured over
                        <span class="font-medium">{{ getDaySpan() }} days</span>
                    </div>
                    <div class="flex items-center gap-2 justify-center">
                        <div class="flex items-center gap-1 px-3 py-1 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                            <svg class="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span class="text-xs font-medium text-blue-700 dark:text-blue-300">{{ formatDateShort($root.totalDates[$root.totalDates.length - 1]) }}</span>
                        </div>
                        <svg class="w-4 h-4 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                        </svg>
                        <div class="flex items-center gap-1 px-3 py-1 bg-green-50 dark:bg-green-900/20 rounded-lg">
                            <svg class="w-4 h-4 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span class="text-xs font-medium text-green-700 dark:text-green-300">{{ formatDateShort($root.totalDates[0]) }}</span>
                        </div>
                    </div>

                    <!-- Date Timeline Visualization -->
                    <div v-if="$root.totalDates.length <= 7" class="flex flex-wrap gap-1 justify-center mt-3">
                        <span v-for="date in $root.totalDates.slice().reverse()"
                              :key="date"
                              class="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors"
                              :title="$root.dateToString(date)">
                            {{ formatDateShort(date) }}
                        </span>
                    </div>
                    <div v-else class="mt-3 text-xs text-gray-500 dark:text-gray-400">
                        <template v-if="getDataFrequency()">
                            <span class="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 dark:bg-amber-900/20 rounded">
                                <svg class="w-3 h-3 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span class="text-amber-700 dark:text-amber-300">{{ getDataFrequency() }}</span>
                            </span>
                        </template>
                    </div>
                </div>
            </div>
      </div>

      <!-- Quick Stats Cards -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div class="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                <div class="flex items-center gap-2 mb-2">
                    <svg class="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span class="text-sm font-medium text-green-700 dark:text-green-300">Time Saved</span>
                </div>
                <div class="text-2xl font-bold text-green-600 dark:text-green-400">{{ $root.totalTimeSaved }} hours</div>
                <div class="text-xs text-green-600 dark:text-green-400 mt-1">vs manual research</div>
            </div>

            <div class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                <div class="flex items-center gap-2 mb-2">
                    <svg class="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <span class="text-sm font-medium text-blue-700 dark:text-blue-300">Data Points</span>
                </div>
                <div class="text-2xl font-bold text-blue-600 dark:text-blue-400">{{ $root.totalDataPoints.toLocaleString() }}</div>
                <div class="text-xs text-blue-600 dark:text-blue-400 mt-1">analyzed items</div>
            </div>

            <div class="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
                <div class="flex items-center gap-2 mb-2">
                    <svg class="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span class="text-sm font-medium text-purple-700 dark:text-purple-300">AI Models</span>
                </div>
                <div class="text-2xl font-bold text-purple-600 dark:text-purple-400">{{ $root.totalCounts.bots }}</div>
                <div class="text-xs text-purple-600 dark:text-purple-400 mt-1">unique models</div>
            </div>
      </div>

      <!-- Table of Contents Section -->
      <div class="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-lg mb-6">
            <div class="px-4 py-3 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors flex items-center justify-between">
                <button @click="tocSectionExpanded = !tocSectionExpanded"
                        class="flex items-center gap-2">
                    <svg class="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                    <span class="font-semibold text-gray-700 dark:text-gray-200">Table of Contents</span>
                </button>

                <div class="flex items-center gap-3">

                    <!-- Expand/Collapse Icon -->
                    <button @click="tocSectionExpanded = !tocSectionExpanded">
                        <svg class="w-5 h-5 text-gray-400 dark:text-gray-500 transition-transform" :class="tocSectionExpanded ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                </div>
            </div>

            <div v-show="tocSectionExpanded" class="p-4 relative">
                <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    <div v-for="(items, groupName) in groupedOptionsWithCounts" :key="groupName"
                         class="border-l-4 border-gray-200 pl-3">
                        <h3 class="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-2 flex items-center justify-between">
                            <span>{{ groupName.split(' (')[0] }}</span>
                            <span v-if="groupName.includes('(')" class="text-xs font-normal text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                                {{ groupName.match(/\\(([^)]+)\\)/)?.[1] }}
                            </span>
                        </h3>
                        <div class="space-y-1">
                            <a v-for="item in items"
                               :key="item.id"
                               :href="'#parent_div_for_' + item.id"
                               @click.prevent="$root.scrollToElement('parent_div_for_' + item.id)"
                               class="block text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 px-2 py-1 rounded transition-colors">
                                <span class="flex items-center gap-2">
                                    <svg v-if="item.type === 'table-with-items'" class="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                    <svg v-else-if="item.type === 'graph-with-items'" class="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                    </svg>
                                    <svg v-else class="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    {{ item.title.replace(' Table', '').replace(' Graph', '') }}
                                </span>
                            </a>
                        </div>
                    </div>
                </div>
                <!-- Questions Section for Aggregate Reports -->
                <div v-if="$root.report_type === 'aggregate' && $root.questionsData" class="mt-4 pt-4 border-t border-gray-200">
                    <div class="space-y-3">
                        <div class="flex items-center justify-between">
                            <div class="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Questions Analyzed ({{ questions_count }})
                            </div>
                            <button @click="questionsExpanded = !questionsExpanded"
                                    class="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300">
                                {{ questionsExpanded ? 'Hide' : 'Show' }} Questions
                            </button>
                        </div>

                        <div v-show="questionsExpanded" class="space-y-2">
                            <input v-if="questions_count > 5"
                                   v-model="questionSearch"
                                   type="text"
                                   placeholder="Search questions..."
                                   class="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500">

                            <div class="max-h-64 overflow-y-auto space-y-1">
                                <a v-for="question in filteredQuestions"
                                   :key="question.id"
                                   :href="question.reportUrl"
                                   class="block p-2 rounded bg-gray-50/50 dark:bg-gray-700/30 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors group">
                                    <div class="flex items-start gap-3">
                                        <span class="flex-shrink-0 inline-flex items-center justify-center w-7 h-7 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full group-hover:bg-blue-100 dark:group-hover:bg-blue-900 group-hover:text-blue-700 dark:group-hover:text-blue-300">
                                            {{ question.number }}
                                        </span>
                                        <div class="flex-1 min-w-0">
                                            <p class="text-sm text-gray-700 dark:text-gray-300 group-hover:text-blue-700 dark:group-hover:text-blue-300 truncate">
                                                {{ question.text }}
                                            </p>
                                            <p class="text-xs text-gray-500 dark:text-gray-400">
                                                {{ question.answerCount }} answers
                                            </p>
                                        </div>
                                        <svg class="flex-shrink-0 w-4 h-4 text-gray-400 dark:text-gray-500 group-hover:text-blue-600 dark:group-hover:text-blue-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                                        </svg>
                                    </div>
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
      </div>

      <!-- Data Coverage Section -->
      <div class="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-lg">
            <button @click="dataSectionExpanded = !dataSectionExpanded"
                    class="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <svg class="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v1a1 1 0 001 1h4a1 1 0 001-1v-1m3-2V8a2 2 0 00-2-2H8a2 2 0 00-2 2v6m0 0a2 2 0 002 2h8a2 2 0 002-2m-6-6v6" />
                    </svg>
                    <span class="font-semibold text-gray-700 dark:text-gray-200">AI Models & Data Coverage Details</span>
                </div>
                <svg class="w-5 h-5 text-gray-400 dark:text-gray-500 transition-transform" :class="dataSectionExpanded ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            <div v-show="dataSectionExpanded" class="p-4">

                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    <div v-for="bot in $root.bots" :key="bot.id"
                         class="flex items-center gap-3 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700">
                        <img v-if="bot.url"
                             :src="'https://www.google.com/s2/favicons?domain=' + extractDomain(bot.url) + '&sz=16'"
                             class="w-5 h-5 flex-shrink-0"
                             :alt="bot.name">
                        <div class="min-w-0 flex-1">
                            <div class="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{{ bot.name }}</div>
                            <div class="text-xs text-gray-500 dark:text-gray-400">
                                <template v-if="bot.estimated_mau">
                                    {{ formatUsers(bot.estimated_mau) }} users
                                </template>
                                <template v-if="bot.tags">
                                    <span class="ml-2">{{ bot.tags }}</span>
                                </template>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div v-if="$root.totalCounts.products > 0">
                        <div class="text-xs text-gray-500 dark:text-gray-400 uppercase">Products</div>
                        <div class="text-xl font-semibold text-gray-700 dark:text-gray-300">{{ $root.totalCounts.products }}</div>
                    </div>
                    <div v-if="$root.totalCounts.organizations > 0">
                        <div class="text-xs text-gray-500 dark:text-gray-400 uppercase">Organizations</div>
                        <div class="text-xl font-semibold text-gray-700 dark:text-gray-300">{{ $root.totalCounts.organizations }}</div>
                    </div>
                    <div v-if="$root.totalCounts.persons > 0">
                        <div class="text-xs text-gray-500 dark:text-gray-400 uppercase"> Persons</div>
                        <div class="text-xl font-semibold text-gray-700 dark:text-gray-300">{{ $root.totalCounts.persons }}</div>
                    </div>
                    <div v-if="$root.totalCounts.places > 0">
                        <div class="text-xs text-gray-500 dark:text-gray-400 uppercase">Places</div>
                        <div class="text-xl font-semibold text-gray-700 dark:text-gray-300">{{ $root.totalCounts.places }}</div>
                    </div>
                    <div v-if="$root.totalCounts.events > 0">
                        <div class="text-xs text-gray-500 dark:text-gray-400 uppercase">Events</div>
                        <div class="text-xl font-semibold text-gray-700 dark:text-gray-300">{{ $root.totalCounts.events }}</div>
                    </div>
                    <div v-if="$root.totalCounts.keywords > 0">
                        <div class="text-xs text-gray-500 dark:text-gray-400 uppercase">Keywords</div>
                        <div class="text-xl font-semibold text-gray-700 dark:text-gray-300">{{ $root.totalCounts.keywords }}</div>
                    </div>
                    <div v-if="$root.totalCounts.links > 0">
                        <div class="text-xs text-gray-500 dark:text-gray-400 uppercase">Links</div>
                        <div class="text-xl font-semibold text-gray-700 dark:text-gray-300">{{ $root.totalCounts.links }}</div>
                    </div>
                    <div v-if="$root.totalCounts.linkTypes > 0">
                        <div class="text-xs text-gray-500 dark:text-gray-400 uppercase">Link Types</div>
                        <div class="text-xl font-semibold text-gray-700 dark:text-gray-300">{{ $root.totalCounts.linkTypes }}</div>
                    </div>
                </div>

                <div class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400">
                    <div class="flex items-center gap-2">
                        <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>Time saved calculated as 5 minutes per data point analyzed</span>
                    </div>
                </div>
            </div>
      </div>
    </base-section-component>
`,
    methods: {
        extractDomain(url) {
            try {
                const domain = new URL(url).hostname;
                return domain.replace('www.', '');
            } catch {
                return '';
            }
        },
        formatUsers(count) {
            if (count >= 1000000000) return (count / 1000000000).toFixed(1) + 'B';
            if (count >= 1000000) return (count / 1000000).toFixed(1) + 'M';
            if (count >= 1000) return (count / 1000).toFixed(1) + 'K';
            return count.toString();
        }
    },
    computed: {
        groupedOptions() {
            const groups = {};
            this.obj.options.forEach(option => {
                const pathParts = option.path.split('/');
                const groupName = pathParts[0];
                if (!groups[groupName]) {
                    groups[groupName] = [];
                }
                groups[groupName].push(option);
            });
            return groups;
        },
        groupedOptionsWithCounts() {
            const groups = this.groupedOptions;
            const result = {};

            Object.entries(groups).forEach(([groupName, items]) => {
                // Convert groupName to lowercase and remove 's' at the end for matching with totalCounts
                const countKey = groups[groupName][0]?.sourceArrayName;
                const count = (countKey === undefined || !countKey) ? '' : ` (${this.$root.totalCounts?.[countKey]})`;
                result[`${groupName}${count}`] = items;
            });

            return result;
        },
        mainSections() {
            const mainSections = {};
            Object.entries(this.groupedOptionsWithCounts).forEach(([groupName, items]) => {
                mainSections[groupName] = [items[0]];
            });
            return mainSections;
        },
        questions_count() {
            return this.$root.questionsData?.totalQuestions || 0;
        },
        filteredQuestions() {
            if (!this.$root.questionsData || !this.$root.questionsData.questions) {
                return [];
            }

            let questions = [...this.$root.questionsData.questions];

            if (this.questionSearch) {
                const search = this.questionSearch.toLowerCase();
                questions = questions.filter(q =>
                    q.text.toLowerCase().includes(search) ||
                    q.id.toLowerCase().includes(search) ||
                    q.number.toString().includes(search)
                );
            }

            return questions;
        }
    },
    methods: {
        showReportSelector() {
            // Emit an event to show the report selector
            EventBus.$emit('show-report-selector');
        }
    }
});

Vue.component('questions-table', {
    extends: baseProps,
    template: `
        <base-section-component :obj="obj" :is-section="true">
            <div v-if="questionsData && questionsData.questions && questionsData.questions.length > 0">
                <div class="mb-4 text-sm text-gray-600 dark:text-gray-400">
                    Total Questions: {{ questionsData.totalQuestions }} | Total Answers: {{ questionsData.totalAnswers }}
                </div>
                
                <!-- Search filter -->
                <div v-if="obj.hasSearchFilter" class="mb-4">
                    <input 
                        v-model="searchQuery"
                        type="text"
                        placeholder="Search questions..."
                        class="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md w-full focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    />
                </div>
                
                <!-- Questions Table -->
                <div class="overflow-x-auto">
                    <table class="min-w-full report-table">
                        <thead>
                            <tr>
                                <th @click="sortBy('number')" class="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider cursor-pointer report-table__header">
                                    # <span v-if="sortColumn === 'number'" class="ml-1">{{ sortDirection === 'asc' ? '▲' : '▼' }}</span>
                                </th>
                                <th @click="sortBy('text')" class="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider cursor-pointer report-table__header">
                                    Question <span v-if="sortColumn === 'text'" class="ml-1">{{ sortDirection === 'asc' ? '▲' : '▼' }}</span>
                                </th>
                                <th @click="sortBy('answerCount')" class="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider cursor-pointer report-table__header">
                                    Answers <span v-if="sortColumn === 'answerCount'" class="ml-1">{{ sortDirection === 'asc' ? '▲' : '▼' }}</span>
                                </th>
                                <th class="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider report-table__header">
                                    Action
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="question in filteredAndSortedQuestions" :key="question.id">
                                <td class="px-4 py-3 whitespace-nowrap text-sm report-table__cell">
                                    {{ question.number }}
                                </td>
                                <td class="px-4 py-3 text-sm report-table__cell">
                                    <div class="max-w-lg truncate" :title="question.text">
                                        {{ question.text }}
                                    </div>
                                </td>
                                <td class="px-4 py-3 whitespace-nowrap text-sm report-table__cell">
                                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                                        {{ question.answerCount }}
                                    </span>
                                </td>
                                <td class="px-4 py-3 whitespace-nowrap text-sm">
                                    <a :href="question.reportUrl" class="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-200 font-medium">
                                        View Report →
                                    </a>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
            <div v-else-if="!isAggregateReport" class="text-gray-500 dark:text-gray-400 italic">
                Questions table is only available in aggregate reports.
            </div>
            <div v-else class="text-gray-500 dark:text-gray-400 italic">
                No questions data available.
            </div>
        </base-section-component>
    `,
    data() {
        return {
            searchQuery: '',
            sortColumn: 'number',
            sortDirection: 'asc'
        };
    },
    computed: {
        questionsData() {
            return this.$root.questionsData;
        },
        isAggregateReport() {
            return this.$root.report_type === 'aggregate';
        },
        filteredAndSortedQuestions() {
            if (!this.questionsData || !this.questionsData.questions) {
                return [];
            }

            let questions = [...this.questionsData.questions];

            // Apply search filter
            if (this.searchQuery) {
                const query = this.searchQuery.toLowerCase();
                questions = questions.filter(q =>
                    q.text.toLowerCase().includes(query) ||
                    q.id.toLowerCase().includes(query)
                );
            }

            // Apply sorting
            questions.sort((a, b) => {
                let aVal = a[this.sortColumn];
                let bVal = b[this.sortColumn];

                if (typeof aVal === 'string') {
                    aVal = aVal.toLowerCase();
                    bVal = bVal.toLowerCase();
                }

                if (this.sortDirection === 'asc') {
                    return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
                } else {
                    return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
                }
            });

            return questions;
        }
    },
    methods: {
        sortBy(column) {
            if (this.sortColumn === column) {
                this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                this.sortColumn = column;
                this.sortDirection = 'asc';
            }
        }
    }
});

Vue.component('share-page-widget', {
    extends: baseProps,
    data() {
        return {
            showSharePopup: false
        };
    },
    methods: {
        toggleSharePopup() {
            this.showSharePopup = !this.showSharePopup;
        },
        shareOnTwitter() {
            const text = encodeURIComponent(document.title);
            const url = encodeURIComponent(window.location.href);
            window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank');
        },
        shareOnFacebook() {
            const url = encodeURIComponent(window.location.href);
            window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank');
        },
        shareOnReddit() {
            const title = encodeURIComponent(document.title);
            const url = encodeURIComponent(window.location.href);
            window.open(`https://reddit.com/submit?title=${title}&url=${url}`, '_blank');
        },
        shareViaEmail() {
            const subject = encodeURIComponent(document.title);
            const body = encodeURIComponent(`Check out this link: ${window.location.href}`);
            window.location.href = `mailto:?subject=${subject}&body=${body}`;
        },
        shareCopyLink(event) {
            const button = event.currentTarget;
            const url = window.location.href;

            // Disable the button to prevent multiple clicks
            button.disabled = true;

            navigator.clipboard.writeText(url).then(() => {
                // Provide feedback by changing button text to 'Copied!'
                const originalText = button.querySelector('span').textContent;
                button.querySelector('span').textContent = 'Copied!';
                setTimeout(() => {
                    button.querySelector('span').textContent = originalText;
                    button.disabled = false;
                }, 2000);
            }).catch((err) => {
                console.error('Could not copy text: ', err);
                // Provide feedback by changing button text to 'Failed to copy'
                const originalText = button.querySelector('span').textContent;
                button.querySelector('span').textContent = 'Failed to copy';
                setTimeout(() => {
                    button.querySelector('span').textContent = originalText;
                    button.disabled = false;
                }, 2000);
            });
        },
    },
    template: `
        <base-component :obj="obj">
            <div class="share-button">
                <button @click="toggleSharePopup"
                class="bg-secondary hover:bg-blue-600 dark:hover:bg-blue-500 text-white font-bold py-2 px-4 rounded-full flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"
                    aria-hidden="true">
                    <path
                        d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" />
                </svg>
                Share
            </button>
            <div class="share-popup" :class="{ 'show': showSharePopup }">
                <div class="share-option" @click="shareOnTwitter" role="button" tabindex="0"
                    aria-label="Share on X.com">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#1DA1F2" aria-hidden="true">
                        <path
                            d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z" />
                    </svg>
                    Share on X.com
                </div>
                <div class="share-option" @click="shareOnFacebook" role="button" tabindex="0"
                    aria-label="Share on Facebook">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#4267B2" aria-hidden="true">
                        <path
                            d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                    </svg>
                    Share on Facebook
                </div>
                <div class="share-option" @click="shareOnReddit" role="button" tabindex="0"
                    aria-label="Share on Reddit">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#FF4500" aria-hidden="true">
                        <path
                            d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z" />
                    </svg>
                    Share on Reddit
                </div>
                <div class="share-option" @click="shareViaEmail" role="button" tabindex="0"
                    aria-label="Share via Email">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#000000" aria-hidden="true">
                        <path
                            d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
                    </svg>
                    Share via Email
                </div>

                <!-- Copy Link Option -->
                <div class="share-option" @click="shareCopyLink($event)" role="button" tabindex="0"
                    aria-label="Copy Link">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#000000" aria-hidden="true"
                        class="h-5 w-5 mr-2">
                        <path
                            d="M10.59 13.41a1 1 0 001.42 0l2.83-2.83a1 1 0 10-1.42-1.42l-2.83 2.83a1 1 0 000 1.42zM14 7H6a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-8a2 2 0 00-2-2zm0 10H6v-8h8v8zm2-10h4a2 2 0 012 2v8a2 2 0 01-2 2h-4a2 2 0 01-2-2v-8a2 2 0 012-2z" />
                    </svg>
                    <span>Copy Link</span>
                </div>
            </div>
            </div>
        </base-component>
    `
});



Vue.component('content-text', {
    extends: baseProps,
    computed: {
        processedSummary() {
            // First clean the AI summary, then add clickable entity links
            const cleaned = this.$root.cleanAISummary(this.$root.summaryHtml || '');
            return this.$root.processTextForClickableEntities(cleaned);
        }
    },
    mounted() {
        // Add event listeners for clickable entities after component is mounted
        this.attachClickableEntityListeners();
    },
    updated() {
        // Re-attach event listeners when component updates (e.g., when expanding/collapsing)
        this.attachClickableEntityListeners();
    },
    methods: {
        attachClickableEntityListeners() {
            this.$nextTick(() => {
                // Find all clickable entity elements in this component
                const clickableEntities = this.$el.querySelectorAll('.clickable-entity');

                clickableEntities.forEach(element => {
                    // Remove existing listeners to avoid duplicates
                    element.removeEventListener('click', this.handleEntityClick);

                    // Add click listener
                    element.addEventListener('click', this.handleEntityClick);
                });
            });
        },

        handleEntityClick(event) {
            event.preventDefault();
            const entityType = event.target.getAttribute('data-entity-type');
            const entityValue = event.target.getAttribute('data-entity-value');

            if (entityType && entityValue) {
                console.debug('Clicked entity:', entityType, entityValue);
                this.$root.navigateToEntity(entityType, entityValue);
            }
        }
    },
    template: `
        <base-section-component :obj="obj">
        <div class="flex flex-col">
            <div class="flex justify-between items-center mb-3">
                <h2 class="text-xl font-semibold flex items-center gap-2">
                    <a 
                        title="Return to table of contents"
                        href="#" 
                       @click.prevent="$root.scrollToElement('parent_div_for_about_report')"
                       class="text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition duration-300">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                        </svg>
                    </a>
                    {{ obj.title }}
                </h2>
                <button @click="$root.copyElementToClipboard('text-content-full-' + obj.id, $event.target)"
                    class="py-1 px-3 rounded text-sm transition duration-300 ease-in-out flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24"
                        stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                </button>
            </div>

            <div class="text-content">
                <div 
                    :id="'text-content-trimmed-' + obj.id" 
                    class="text-content-trimmed"
                    v-html="processedSummary"></div>
                <div
                    :id="'text-content-full-' + obj.id"
                    class="text-content-full hidden"
                    v-html="processedSummary"></div>
                <button 
                    :id="'text-content-read-more-btn-' + obj.id"
                    class="mt-3 w-full px-4 py-2 bg-secondary text-white rounded text-sm hover:bg-blue-600 dark:hover:bg-blue-500"
                    @click="$root.toggleSummaryShowMore(obj.id)">Read more</button>
            </div>
            </div>
        </base-section-component>
    `
});


Vue.component('table-with-items', {
    extends: baseProps,
    template: `
        <base-section-component :obj="obj">
            <div class="flex justify-between items-center mb-3">
                <h2 class="text-xl font-semibold flex items-center gap-2">
                    <a href="#" 
                        title="Return to table of contents"
                       @click.prevent="$root.scrollToElement('parent_div_for_about_report')"
                       class="text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition duration-300">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                        </svg>
                    </a>
                    {{ obj.title }}
                </h2>
                <div class="text-right">
                    <a href="#" @click.prevent="$parent.exportTable(obj.id)"
                        class="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm">
                        → to csv
                    </a>
                </div>
            </div>
            <div class="flex justify-between items-center mb-3">
                    <div class="text-gray-500 text-sm pr-2">                        
                        <span class="text-sm">
                            <template v-if="$parent['current_filtered_count_' + obj.id] > -1">
                                <span :class="{'text-red-500 dark:text-red-400 font-bold': $parent['current_filtered_count_' + obj.id] === 0}">                                    
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/></svg>    
                                    {{ $parent['current_filtered_count_' + obj.id] }}/{{ $parent['total_count_' + obj.id] }}
                                </span>
                                <br/>
                                    <a href="#"
                                        class="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                                        @click.prevent="$parent.resetAllFilters(obj.id)">
                                        reset
                                    </a>
                                </template>
                            </template>
                            <template v-else>
                                 Σ {{ $parent['total_count_' + obj.id] }}
                            </template>
                        </span>                        
                    </div>

                    <div v-if="obj.hasAppearanceOrderTrendFilter" class="w-80">
                        <multi-select-combobox
                            :obj="{id: this.getObjectId + '-multiselect-appearanceOrder-trend-filter'}"
                            :options="$parent[obj.id + '_appearanceOrder_trend_ids']"
                            :selection-type="'trend'"
                            :descriptions="$parent[obj.id + '_appearanceOrder_trend_names_with_counts']"
                            v-model="$parent['selected_' + obj.id + '_appearanceOrder_Trends']"
                            :all-caption-string="$parent.ALL_TRENDS_OPTION_CAPTION"
                        ></multi-select-combobox>
                    </div> 

                    <div v-if="$parent.isAggregateReport" class="w-80">
                        <combobox-select
                            :obj="{id: this.getObjectId + '-combobox-prompt-filter'}"
                            :options="$parent.getAvailablePrompts().map(p => p.id)"
                            :selection-type="'prompt'"
                            :descriptions="$parent.getAvailablePrompts().reduce((acc, p) => ({...acc, [p.id]: p.label}), {})"
                            v-model="$parent.selectedPromptFilter"
                            :all-caption-string="'All Prompts'"
                        ></combobox-select>
                    </div>                    
                    

                    
                    <div v-if="obj.hasModelFilter" class="w-80">
                        <multi-select-combobox
                            :obj="{id: this.getObjectId + '-multiselect-bot-filter'}"
                            :options="$parent[obj.id + '_bot_ids']"
                            :selection-type="'bot'"
                            :descriptions="$parent[obj.id + '_bot_names_with_counts']"
                            v-model="$parent['selected_' + obj.id + '_AIModels']"
                            :all-caption-string="$parent.ALL_MODELS_OPTION_CAPTION"
                        ></multi-select-combobox>
                    </div>
                    
            </div>
            <div class="mb-3">

                <div v-if="obj.hasSearchFilter" class="relative">
                    <input type="text" :id="obj.id + '_searchTerm'" v-model="$root[obj.id + '_searchTerm']"
                        :placeholder="'type to filter by ' + obj.searchFilterFields.map(field => 
                        obj.columns.find(col => col.type === field)?.caption.toLowerCase() || field
                        ).join(', ') + '...'"                    
                        class="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded py-2 px-3 mb-2 pr-10 placeholder-gray-500 dark:placeholder-gray-400">
                    <button v-if="$root[obj.id + '_searchTerm']" @click="$root[obj.id + '_searchTerm'] = ''"
                        class="absolute inset-y-0 right-0 flex items-center pr-3">
                        <svg class="h-4 w-4 text-gray-500 hover:text-gray-700" xmlns="http://www.w3.org/2000/svg" fill="none"
                            viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>            
            </div>

                <div class="overflow-x-auto">
                    <table :id="obj.id" class="min-w-full sortable-table nowrap-cell report-table">
                    <thead>
                        <tr>
                            <th 
                                v-for="column in obj.columns" 
                                class="px-3 py-2 text-left cursor-pointer"
                                :data-sort="column.type"
                                >
                                {{ column.caption }}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <!-- Table rows will be dynamically inserted here -->
                    </tbody>
                </table>
            </div>
            <button :id="'button_expand_' + obj.id"
                class="mt-3 w-full px-4 py-2 bg-secondary text-white rounded text-sm hover:bg-blue-600 dark:hover:bg-blue-500">
                Show More
            </button>
        </base-section-component>
    `,
    mounted() {
        // do not init here, we initializer later in the parent        
        //this.$parent.init_table(this.obj);
    }
});

/**
 * Tabbed Table/Graph Component
 * 
 * This component provides a tabbed interface for switching between table and graph views.
 * 
 * Refactoring Note: This component uses a hybrid approach for state management:
 * 1. SharedStore for new implementations (reduces parent coupling)
 * 2. Fallback to $parent for backward compatibility
 * 
 * Future improvements could fully migrate to props/events or a state management library.
 */
Vue.component('tabbed-table-graph', {
    extends: baseProps,
    mixins: [graphZoomMixin],
    data() {
        return {
            activeTab: 'table', // 'table' or 'graph'
            graphInitialized: false, // Track if graph has been initialized
            nodeLimit: DEFAULT_GRAPH_NODE_LIMIT // Default node limit for graph view
        }
    },
    computed: {
        tableId() { return this.obj.tableConfig.id; },
        graphId() { return this.obj.graphConfig.id; },
        activeId() { return this.activeTab === 'table' ? this.tableId : this.graphId; },
        searchTermProxy: {
            get() {
                const id = this.activeId;
                // Try SharedStore first, fallback to parent for backward compatibility
                return SharedStore.get(`${id}_searchTerm`) || this.$root[`${id}_searchTerm`];
            },
            set(val) {
                // Update both table and graph search terms
                SharedStore.set(`${this.tableId}_searchTerm`, val);
                SharedStore.set(`${this.graphId}_searchTerm`, val);
                // Maintain backward compatibility
                this.$root[`${this.tableId}_searchTerm`] = val;
                this.$root[`${this.graphId}_searchTerm`] = val;
            }
        },
        engineProxy: {
            get() {
                const id = this.activeId;
                // Try SharedStore first, fallback to parent for backward compatibility
                return SharedStore.get(`selected_${id}_AIModels`) || this.$parent[`selected_${id}_AIModels`];
            },
            set(val) {
                // Update both table and graph engine selections
                SharedStore.set(`selected_${this.tableId}_AIModels`, val);
                SharedStore.set(`selected_${this.graphId}_AIModels`, val);
                // Maintain backward compatibility
                this.$parent[`selected_${this.tableId}_AIModels`] = val;
                this.$parent[`selected_${this.graphId}_AIModels`] = val;
            }
        },
        trendProxy: {
            get() {
                const id = this.activeId;
                // Try SharedStore first, fallback to parent for backward compatibility
                return SharedStore.get(`selected_${id}_appearanceOrder_Trends`) || this.$parent[`selected_${id}_appearanceOrder_Trends`];
            },
            set(val) {
                // Update both table and graph trend selections
                SharedStore.set(`selected_${this.tableId}_appearanceOrder_Trends`, val);
                SharedStore.set(`selected_${this.graphId}_appearanceOrder_Trends`, val);
                // Maintain backward compatibility
                this.$parent[`selected_${this.tableId}_appearanceOrder_Trends`] = val;
                this.$parent[`selected_${this.graphId}_appearanceOrder_Trends`] = val;
            }
        }
    },
    methods: {
        attemptGraphInit() {
            // Helper method to initialize graph, returns true if successful
            const filteredData = this.$parent[`filtered_${this.obj.graphConfig.id}`];
            if (filteredData && filteredData.length > 0) {
                // Set the node limit before initializing
                this.$parent[`${this.obj.graphConfig.id}_topItemsLimit`] = this.nodeLimit;
                this.$parent.init_graph(this.obj.graphConfig);
                this.graphInitialized = true;
                console.debug(`Graph initialized for ${this.obj.graphConfig.id} with ${filteredData.length} items, limit: ${this.nodeLimit}`);
                return true;
            }
            return false;
        },
        onNodeLimitChange() {
            // Update the parent's topItemsLimit for the graph
            this.$parent[`${this.obj.graphConfig.id}_topItemsLimit`] = this.nodeLimit;

            // If graph is already initialized, reinitialize with new limit
            if (this.graphInitialized) {
                console.debug(`Updating graph node limit to ${this.nodeLimit}`);
                this.$parent.init_graph(this.obj.graphConfig);
                // Reset zoom when graph is reinitialized
                this.currentZoom = 1;
            }
        }
    },
    template: `
        <base-section-component :obj="obj" :section-title="obj.title" :has-export-link="true" :export-handler="() => $parent.exportTable(obj.tableConfig.id)">
            <!-- Tab buttons -->
            <div class="flex border-b border-gray-200 mb-4">
                <button @click="activeTab = 'table'" 
                        :class="activeTab === 'table' ? 
                            'px-4 py-2 border-b-2 border-blue-500 text-blue-600 dark:text-blue-400 font-semibold bg-blue-50 dark:bg-blue-900/20' : 
                            'px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors'">
                    <span class="flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Table View
                    </span>
                </button>
                <button @click="activeTab = 'graph'" 
                        :class="activeTab === 'graph' ? 
                            'px-4 py-2 border-b-2 border-blue-500 text-blue-600 dark:text-blue-400 font-semibold bg-blue-50 dark:bg-blue-900/20' : 
                            'px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors'">
                    <span class="flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        Graph View
                    </span>
                </button>
            </div>
            
            <!-- Shared filters section -->
            <div class="flex justify-between items-center mb-3">
                <div class="text-gray-500 text-sm pr-2">                        
                    <span class="text-sm">
                        <template v-if="$parent['current_filtered_count_' + activeId] > -1">
                            <span :class="{'text-red-500 dark:text-red-400 font-bold': $parent['current_filtered_count_' + activeId] === 0}">                                    
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/></svg>    
                                {{ $parent['current_filtered_count_' + activeId] }}/{{ $parent['total_count_' + activeId] }}
                            </span>
                            <br/>
                                <a href="#"
                                    class="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                                    @click.prevent="$parent.resetAllFilters(activeId)">
                                    reset
                                </a>
                            </template>
                        </template>
                        <template v-else>
                             Σ {{ $parent['total_count_' + activeId] }}
                        </template>
                    </span>                        
                </div>

                
                <div v-if="obj.tableConfig.hasAppearanceOrderTrendFilter" class="w-80">
                    <multi-select-combobox
                        :obj="{id: this.getObjectId + '-multiselect-appearanceOrder-trend-filter'}"
                        :options="$parent[obj.tableConfig.id + '_appearanceOrder_trend_ids']"
                        :selection-type="'trend'"
                        :descriptions="$parent[obj.tableConfig.id + '_appearanceOrder_trend_names_with_counts']"
                        v-model="trendProxy"
                        :all-caption-string="$parent.ALL_TRENDS_OPTION_CAPTION"
                    ></multi-select-combobox>
                </div> 
                

                <div v-if="obj.tableConfig.hasModelFilter" class="w-80">
                    <multi-select-combobox
                        :obj="{id: this.getObjectId + '-multiselect-bot-filter'}"
                        :options="$parent[obj.tableConfig.id + '_bot_ids']"
                        :selection-type="'bot'"
                        :descriptions="$parent[obj.tableConfig.id + '_bot_names_with_counts']"
                        v-model="engineProxy"
                        :all-caption-string="$parent.ALL_MODELS_OPTION_CAPTION"
                    ></multi-select-combobox>
                </div>
            </div>
            
            <!-- Search filter -->
            <div class="mb-3">
                <div v-if="obj.tableConfig.hasSearchFilter" class="relative">
                    <input type="text" :id="obj.tableConfig.id + '_searchTerm'" v-model="searchTermProxy"
                        :placeholder="'type to filter by ' + obj.tableConfig.searchFilterFields.map(field => 
                        obj.tableConfig.columns.find(col => col.type === field)?.caption.toLowerCase() || field
                        ).join(', ') + '...'"                    
                        class="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded py-2 px-3 mb-2 pr-10 placeholder-gray-500 dark:placeholder-gray-400">
                    <button v-if="searchTermProxy" @click="searchTermProxy = ''"
                        class="absolute inset-y-0 right-0 flex items-center pr-3">
                        <svg class="h-4 w-4 text-gray-500 hover:text-gray-700" xmlns="http://www.w3.org/2000/svg" fill="none"
                            viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>            
            </div>
            
            <!-- Tab content -->
            <div v-show="activeTab === 'table'">
                <div class="overflow-x-auto">
                    <table :id="obj.tableConfig.id" class="min-w-full sortable-table nowrap-cell report-table">
                        <thead>
                            <tr>
                                <th
                                    v-for="column in obj.tableConfig.columns"
                                    class="px-3 py-2 text-left cursor-pointer"
                                    :data-sort="column.type"
                                    >
                                    {{ column.caption }}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            <!-- Table rows will be dynamically inserted here -->
                        </tbody>
                    </table>
                </div>
                <button v-if="$parent['filtered_' + obj.tableConfig.id] && $parent['current_visible_items_count_' + obj.tableConfig.id] > -1"
                    :id="'button_expand_' + obj.tableConfig.id"
                    @click="$parent['button_expand_' + obj.tableConfig.id]()"
                    class="w-full p-3 text-center text-blue-600 dark:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition duration-300 border-t">
                    Show More
                </button>
            </div>
            
            <div v-show="activeTab === 'graph'">
                <!-- Node Limit Filter and Zoom Controls for Graph View -->
                <div class="flex justify-end mb-3">
                    <div class="flex items-center gap-4">
                        <div class="flex items-center gap-2">
                            <label class="text-sm text-gray-600 dark:text-gray-400">Show Top Items:</label>
                            <select 
                                v-model="nodeLimit" 
                                @change="onNodeLimitChange"
                                class="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                            >
                                <option :value="3">3</option>
                                <option :value="7">7</option>
                                <option :value="12">12</option>
                                <option :value="20">20</option>
                                <option :value="null">All</option>
                            </select>
                        </div>
                        
                        <!-- Zoom Controls -->
                        <div class="flex items-center gap-1">
                            <button 
                                @click="zoomOut" 
                                title="Zoom Out"
                                class="p-1 border rounded hover:bg-gray-100 transition-colors"
                            >
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"></path>
                                </svg>
                            </button>
                            <button 
                                @click="zoomReset" 
                                title="Reset Zoom (100%)"
                                class="px-2 py-1 border rounded text-xs hover:bg-gray-100 transition-colors"
                            >
                                {{ Math.round(currentZoom * 100) }}%
                            </button>
                            <button 
                                @click="zoomIn" 
                                title="Zoom In"
                                class="p-1 border rounded hover:bg-gray-100 transition-colors"
                            >
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
                <div class="grid grid-cols-1 lg:grid-cols-4 gap-4">
                    <div class="lg:col-span-4">
                        <div :id="obj.graphConfig.id" class="chart-container" style="position: relative; height:50vh; width:100%">
                            <canvas></canvas>
                        </div>                
                    </div>
                </div>
            </div>
        </base-section-component>
    `,
    mounted() {
        // Only initialize the table tab on mount - defer graph until user clicks
        if (this.activeTab === 'table') {
            this.$parent.init_table(this.obj.tableConfig);
        }
        // Graph will be initialized when user first switches to graph tab
    },
    watch: {
        activeTab(newVal) {
            this.$nextTick(() => {
                if (newVal === 'table') {
                    // Reinitialize table if needed
                    this.$parent.init_table(this.obj.tableConfig);
                } else if (newVal === 'graph' && !this.graphInitialized) {
                    // Initialize graph only on first switch and when data is ready
                    console.debug(`Lazy loading graph for ${this.obj.graphConfig.id}`);
                    this.$nextTick(() => {
                        setTimeout(() => {
                            if (!this.attemptGraphInit()) {
                                console.debug(`Graph data not ready for ${this.obj.graphConfig.id}, deferring initialization`);
                                // Retry after a short delay if data isn't ready
                                setTimeout(() => {
                                    this.attemptGraphInit();
                                }, 200);
                            }
                        }, 50); // Small delay to ensure DOM is ready
                    });
                }
            });
        }
    }
});

Vue.component('graph-with-items', {
    extends: baseProps,
    mixins: [graphZoomMixin],
    template: `
        <base-section-component :obj="obj">        
            <div class="flex justify-between items-center mb-1">
                <h2 class="text-xl font-semibold flex items-center gap-2">
                    <a 
                        title="Return to table of contents"
                        href="#" 
                       @click.prevent="$root.scrollToElement('parent_div_for_about_report')"
                       class="text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition duration-300">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                        </svg>
                    </a>
                    {{ obj.title }}
                </h2>
                <div class="text-right">
                    <!-- scroll to the related table -->
                    <a href="#" @click.prevent="$root.scrollToElement('parent_div_for_' + obj.id.replace('graph_', 'table_'))"
                        class="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm">
                        table
                    </a>
                </div>                
            </div>
            <div class="flex justify-between items-center mb-1 pr-2">
                <div class="text-gray-500 text-sm">
                    <template v-if="$parent['current_filtered_count_' + obj.id] > -1">
                        <span :class="{'text-red-500 dark:text-red-400 font-bold': $parent['current_filtered_count_' + obj.id] === 0}">                                    
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/></svg>    
                            {{ $parent['current_filtered_count_' + obj.id] }}/{{ $parent['total_count_' + obj.id] }}
                        </span>
                        <br/>
                            <a href="#"
                                class="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                                @click.prevent="$parent.resetAllFilters(obj.id)">
                                reset
                            </a>
                        </template>
                    </template>
                    <template v-else>
                            Σ {{ $parent['total_count_' + obj.id] }}
                    </template>
                </div>

                
                <div v-if="obj.hasAppearanceOrderTrendFilter" class="w-80">
                    <multi-select-combobox
                        :obj="{id: this.getObjectId + '-multiselect-appearanceOrder-trend-filter'}"
                        :options="$parent[obj.id + '_appearanceOrder_trend_ids']"
                        :descriptions="$parent[obj.id + '_appearanceOrder_trend_names_with_counts']"
                        v-model="$parent['selected_' + obj.id + '_appearanceOrder_Trends']"
                        :selection-type="'trend'"
                        :all-caption-string="$parent.ALL_TRENDS_OPTION_CAPTION"
                    ></multi-select-combobox>
                </div>            
                

                <div v-if="obj.hasModelFilter" class="w-80">
                    <multi-select-combobox
                        :obj="{id: this.getObjectId + '-multiselect-bot-filter'}"
                        :options="$parent[obj.id + '_bot_ids']"
                        :descriptions="$parent[obj.id + '_bot_names_with_counts']"
                        v-model="$parent['selected_' + obj.id + '_AIModels']"
                        :selection-type="'bot'"
                        :all-caption-string="$parent.ALL_MODELS_OPTION_CAPTION"
                    ></multi-select-combobox>
                </div>
            </div>
            <div v-if="obj.hasSearchFilter" class="relative mb-1">
                <input type="text" :id="obj.id + '_searchTerm'" v-model="$root[obj.id + '_searchTerm']"
                    :placeholder="'type to filter by ' + obj.searchFilterFields.map(field =>
                    obj.columns?.find(col => col.type === field)?.caption.toLowerCase() || field
                    ).join(', ') + '...'"
                    class="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded py-2 px-3 mb-2 pr-10 placeholder-gray-500 dark:placeholder-gray-400">
                <button v-if="$root[obj.id + '_searchTerm']" @click="$root[obj.id + '_searchTerm'] = ''"
                    class="absolute inset-y-0 right-0 flex items-center pr-3">
                    <svg class="h-4 w-4 text-gray-500 hover:text-gray-700" xmlns="http://www.w3.org/2000/svg" fill="none"
                        viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
            <!-- Show Top Items Filter and Zoom Controls -->
            <div class="flex justify-end mb-3">
                <div class="flex items-center gap-4">
                    <div class="flex items-center gap-2">
                        <label class="text-sm text-gray-600 dark:text-gray-400">Show Only Top:</label>
                        <select 
                            v-model="$parent[obj.id + '_topItemsLimit']" 
                            class="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                        >
                            <option :value="15">15</option>
                            <option :value="25">25</option>
                            <option :value="50">50</option>
                            <option :value="100">100</option>
                            <option :value="null">All</option>
                        </select>
                    </div>
                    
                    <!-- Zoom Controls -->
                    <div class="flex items-center gap-1">
                        <button 
                            @click="zoomOut" 
                            title="Zoom Out"
                            class="p-1 border rounded hover:bg-gray-100 transition-colors"
                        >
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"></path>
                            </svg>
                        </button>
                        <button 
                            @click="zoomReset" 
                            title="Reset Zoom (100%)"
                            class="px-2 py-1 border rounded text-xs hover:bg-gray-100 transition-colors"
                        >
                            {{ Math.round(currentZoom * 100) }}%
                        </button>
                        <button 
                            @click="zoomIn" 
                            title="Zoom In"
                            class="p-1 border rounded hover:bg-gray-100 transition-colors"
                        >
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>           
            <div class="grid grid-cols-1 lg:grid-cols-4">
                <div class="lg:col-span-4">
                    <div :id="obj.id" class="w-full aspect-square lg:aspect-[4/2]" style="height: 600px;"></div> 
                </div>
            </div>            
        </base-section-component>
    `,
    mounted() {
        // do not init here, we initializer later in the parent        
        //this.$parent.init_graph(this.obj);
    }
});

Vue.component('chart-with-items', {
    extends: baseProps,
    template: `
        <base-section-component :obj="obj">
            <div class="flex justify-between items-center mb-3">
                <h2 class="text-xl font-semibold flex items-center gap-2">
                    <a href="#" 
                       @click.prevent="$root.scrollToElement('parent_div_for_about_report')"
                       class="text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition duration-300">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                        </svg>
                    </a>
                    {{ obj.title }}
                </h2>
            </div>
            <div class="flex justify-between items-center mb-3 pr-2">
                <div class="text-gray-500 text-sm">
                    <template v-if="$parent['current_filtered_count_' + obj.id] > -1">
                        <span :class="{'text-red-500 dark:text-red-400 font-bold': $parent['current_filtered_count_' + obj.id] === 0}">                                    
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/></svg>    
                            {{ $parent['current_filtered_count_' + obj.id] }}/{{ $parent['total_count_' + obj.id] }}
                        </span>
                        <br/>
                            <a href="#"                                 
                                @click.prevent="$parent.resetAllFilters(obj.id)">
                                <span class="text-sm">
                                    reset
                                </span>
                            </a>
                        </template>
                    </template>
                    <template v-else>
                            Σ {{ $parent['total_count_' + obj.id] }}
                    </template>
                </div>

                
                <div v-if="obj.hasAppearanceOrderTrendFilter" class="w-80">
                    <multi-select-combobox
                        :obj="{id: this.getObjectId + '-multiselect-appearanceOrder-trend-filter'}"
                        :options="$parent[obj.id + '_appearanceOrder_trend_ids']"
                        :descriptions="$parent[obj.id + '_appearanceOrder_trend_names_with_counts']"
                        v-model="$parent['selected_' + obj.id + '_appearanceOrder_Trends']"
                        :selection-type="'trend'"
                        :all-caption-string="$parent.ALL_TRENDS_OPTION_CAPTION"
                    ></multi-select-combobox>
                </div>                
                

                <div v-if="obj.hasModelFilter" class="w-80">
                    <multi-select-combobox
                        :obj="{id: this.getObjectId + '-multiselect-bot-filter'}"
                        :options="$parent[obj.id + '_bot_ids']"
                        :descriptions="$parent[obj.id + '_bot_names_with_counts']"
                        v-model="$parent['selected_' + obj.id + '_AIModels']"
                        :selection-type="'bot'"
                        :all-caption-string="$parent.ALL_MODELS_OPTION_CAPTION"
                    ></multi-select-combobox>
                </div>
            </div>
            <div v-if="obj.hasSearchFilter" class="relative">
                <input type="text" :id="obj.id + '_searchTerm'" v-model="$root[obj.id + '_searchTerm']"
                    :placeholder="'type to filter by ' + obj.searchFilterFields.map(field =>
                    obj.columns.find(col => col.type === field)?.caption.toLowerCase() || field
                    ).join(', ') + '...'"
                    class="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded py-2 px-3 mb-2 pr-10 placeholder-gray-500 dark:placeholder-gray-400">
                <button v-if="$root[obj.id + '_searchTerm']" @click="$root[obj.id + '_searchTerm'] = ''"
                    class="absolute inset-y-0 right-0 flex items-center pr-3">
                    <svg class="h-4 w-4 text-gray-500 hover:text-gray-700" xmlns="http://www.w3.org/2000/svg" fill="none"
                        viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>            
            <div class="grid grid-cols-1 lg:grid-cols-4 gap-4">
                <div class="lg:col-span-4">
                    <div :id="obj.id" class="chart-container" style="position: relative; height:50vh; width:100%">
                        <canvas></canvas>
                    </div>                
                </div>
            </div>
        </base-section-component>
    `,
    mounted() {
        this.$parent.init_chart(this.obj);
    }
});

Vue.component('combobox-select', {
    extends: baseProps,
    props: {
        options: Array,
        descriptions: Array,
        value: String,
        selectionType:
        {
            type: String,
            required: true,
            default: 'bot' // 'bot' or 'trend'
        },

        allCaptionString:
        {
            type: String,
            required: true,
            default: '$parent.ALL_MODELS_OPTION_CAPTION'
        }
    },
    data() {
        return {
            isOpen: false,
            searchQuery: ''
        };
    },
    computed: {
        filteredOptions() {
            const query = this.searchQuery.toLowerCase();
            return [this.allCaptionString, ...this.options].filter(option =>
                option.toLowerCase().includes(query) ||
                this.getDescription(option).toLowerCase().includes(query)
            );
        },
        currentValue() {
            return this.value && this.value.length ? this.value : this.allCaptionString;
        }
    },
    mounted() {
        document.addEventListener('mousedown', this.handleClickOutside);
    },
    beforeDestroy() {
        document.removeEventListener('mousedown', this.handleClickOutside);
    },
    methods: {

        toggleDropdown() {
            if (this.isOpen) {
                this.closeDropdown();
                return;
            }

            this.isOpen = true;
            this.$nextTick(() => {
                const searchField = this.$el.querySelector('.combobox-search');
                if (searchField) {
                    if (typeof searchField.focus === 'function') {
                        try {
                            searchField.focus({ preventScroll: true });
                        } catch (e) {
                            searchField.focus();
                        }
                    }
                    if (typeof searchField.select === 'function') {
                        searchField.select();
                    }
                }
            });
        },
        closeDropdown() {
            if (!this.isOpen) {
                return;
            }
            this.isOpen = false;
            this.searchQuery = '';
        },
        selectOption(option) {
            // set to ALL_OPTION_CAPTION if user selected is ALL_OPTION_CAPTION
            // we output as ALL_OPTION_CAPTION in the data or as selected bot id
            this.$emit('input', option === this.allCaptionString ? this.allCaptionString : option);
            this.closeDropdown();
        },
        handleClickOutside(event) {
            if (!this.$el.contains(event.target)) {
                this.closeDropdown();
            }
        },
        getDescription(option) {
            const index = this.options.indexOf(option);
            return index !== -1 ? this.descriptions[index] : this.allCaptionString;
        },
        getComboboxItemIconHtml(option) {
            let iconBaseClassName = null;
            switch (this.selectionType) {
                case 'bot':
                    iconBaseClassName = 'icon_bot';
                    break;
                case 'trend':
                    iconBaseClassName = 'icon_trend';
                    break;
                case 'prompt':
                    iconBaseClassName = 'icon_prompt';
                    break;
                default:
                    throw new Error('ComboboxSelect: Invalid selectionType: ' + this.selectionType);
            }

            if (option === this.allCaptionString)
                return `<span class="${iconBaseClassName} ${iconBaseClassName}_all">${this.allCaptionString.charAt(0).toUpperCase()}</span>`;

            const index = this.options.indexOf(option);
            if (index !== -1) {
                if (this.selectionType === 'bot') {
                    const itemSpecificClassName = this.$root.getModelIconClassName(option);
                    const botIconUrl = this.$root.getModelIconUrl(option);
                    const itemFullName = this.getDescription(option);
                    const botNameHtml = botIconUrl && botIconUrl.length > 0 ? `<img src="${botIconUrl}" width="32" height="32" alt="${itemFullName}" class="">` : itemFullName.charAt(0).toUpperCase();
                    return `<span class="has-data-hint ${iconBaseClassName} ${itemSpecificClassName}">
                        ${botNameHtml}
                    </span>`;
                }
                else if (this.selectionType === 'trend') {
                    return `<span 
                        class="has-data-hint trend-icon ${this.$root.getTrendColorClass(option)} relative"
                        data-trend="${option}"
                    >
                        ${this.$root.getTrendSymbol(option)}
                    </span>`
                }
            }
        },
    },
    template: `
    <base-component :obj="obj">
        <div class="relative" @keydown.esc.stop.prevent="closeDropdown()">
            <button
                type="button"
                class="combobox-trigger"
                :class="{'is-open': isOpen}"
                @click="toggleDropdown"
                :aria-expanded="isOpen ? 'true' : 'false'"
                aria-haspopup="listbox"
            >
                <span class="flex items-center gap-2 min-w-0 text-sm">
                    <span class="combobox-trigger-icon" v-html="getComboboxItemIconHtml(currentValue)"></span>
                    <span class="truncate">{{ getDescription(currentValue) }}</span>
                </span>
                <svg
                    class="combobox-chevron ml-2 h-4 w-4 transition-transform duration-150"
                    :class="{'rotate-180': isOpen}"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                >
                    <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.08 1.04l-4.25 4.25a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clip-rule="evenodd"></path>
                </svg>
            </button>
            <div
                v-if="isOpen"
                class="combobox-panel absolute z-10 w-full"
                role="listbox"
            >
                <input
                    v-model="searchQuery"
                    class="combobox-search"
                    type="text"
                    placeholder="Search..."
                    @keydown.stop
                    @keydown.esc.stop.prevent="closeDropdown()"
                >
                <div class="combobox-options">
                    <div
                        v-for="option in filteredOptions"
                        :key="option"
                        @click="selectOption(option)"
                        class="combobox-option"
                        :class="{'is-selected': option === currentValue}"
                        role="option"
                        :aria-selected="option === currentValue ? 'true' : 'false'"
                    >
                        <span class="combobox-option-icon" v-html="getComboboxItemIconHtml(option)"></span>
                        <span class="truncate">{{ getDescription(option) }}</span>
                    </div>
                </div>
            </div>
        </div>
    </base-component>
`,
});

Vue.component('multi-select-combobox', {
    extends: baseProps,
    props: {
        options: Array,
        descriptions: Array,
        value: {
            type: Array,
            default: () => []
        },
        selectionType: {
            type: String,
            required: true,
            default: 'bot' // 'bot' or 'trend'
        },
        allCaptionString: {
            type: String,
            default: 'All'
        }
    },
    data() {
        return {
            isOpen: false,
            searchQuery: '',
            internalValue: []
        };
    },
    computed: {
        filteredOptions() {
            const query = this.searchQuery.toLowerCase();
            return this.options.filter(option =>
                option.toLowerCase().includes(query) ||
                this.getDescription(option).toLowerCase().includes(query)
            );
        },
        selectedCount() {
            return this.internalValue.length;
        },
        displayText() {
            if (this.selectedCount === 0) {
                return this.allCaptionString;
            } else if (this.selectedCount === 1) {
                return this.getDescription(this.internalValue[0]);
            } else if (this.selectedCount === this.options.length) {
                return `All (${this.selectedCount})`;
            } else {
                // For multiple selections, return HTML with count and icons
                return null; // We'll render this differently in the template
            }
        },
        displayHtml() {
            if (this.selectedCount === 0) {
                return this.allCaptionString;
            } else if (this.selectedCount === 1) {
                // For single selection, show icon and name
                if (this.selectionType === 'bot' && this.$root.getModelIconUrl) {
                    const iconUrl = this.$root.getModelIconUrl(this.internalValue[0]);
                    return `<img src="${iconUrl}" class="w-4 h-4 inline-block mr-1" onerror="this.style.display='none'"> ${this.getDescription(this.internalValue[0])}`;
                } else {
                    return this.getDescription(this.internalValue[0]);
                }
            } else if (this.selectedCount === this.options.length && this.options.length > 5) {
                // Only show "All" if there are more than 5 options and all are selected
                return `All (${this.selectedCount})`;
            } else {
                // For multiple selections (including when all 3-5 are selected), show count and icons
                if (this.selectionType === 'bot' && this.$root.getModelIconUrl) {
                    // Show up to 5 icons for any multiple selection
                    const iconsToShow = Math.min(this.selectedCount, 5);
                    const icons = this.internalValue.slice(0, iconsToShow).map(id => {
                        const iconUrl = this.$root.getModelIconUrl(id);
                        return `<img src="${iconUrl}" class="w-4 h-4 inline-block" title="${this.getDescription(id)}" onerror="this.style.display='none'">`;
                    }).join('');
                    const moreText = this.selectedCount > 5 ? ` +${this.selectedCount - 5}` : '';
                    // If all are selected and there are 5 or fewer options, show "All" prefix
                    const prefix = (this.selectedCount === this.options.length && this.options.length <= 5)
                        ? `<span class="text-gray-500">All (${this.selectedCount})</span> `
                        : `<span class="text-gray-500">(${this.selectedCount})</span> `;
                    return prefix + icons + moreText;
                } else if (this.selectionType === 'trend' && this.$root.getTrendSymbol) {
                    // For trends, show trend symbols (up to 5)
                    const symbolsToShow = Math.min(this.selectedCount, 5);
                    const symbols = this.internalValue.slice(0, symbolsToShow).map(id => {
                        const trendSymbol = this.$root.getTrendSymbol(parseInt(id));
                        return `<span title="${this.getDescription(id)}">${trendSymbol}</span>`;
                    }).join(' ');
                    const moreText = this.selectedCount > 5 ? ` +${this.selectedCount - 5}` : '';
                    // If all are selected and there are 5 or fewer options, show "All" prefix
                    const prefix = (this.selectedCount === this.options.length && this.options.length <= 5)
                        ? `<span class="text-gray-500">All (${this.selectedCount})</span> `
                        : `<span class="text-gray-500">(${this.selectedCount})</span> `;
                    return prefix + symbols + moreText;
                } else {
                    return `${this.selectedCount} selected`;
                }
            }
        },
        allSelected() {
            return this.internalValue.length === this.options.length;
        },
        someSelected() {
            return this.internalValue.length > 0 && this.internalValue.length < this.options.length;
        }
    },
    watch: {
        value: {
            immediate: true,
            handler(newVal) {
                this.internalValue = Array.isArray(newVal) ? [...newVal] : [];
            }
        }
    },
    mounted() {
        document.addEventListener('mousedown', this.handleClickOutside);
    },
    beforeDestroy() {
        document.removeEventListener('mousedown', this.handleClickOutside);
    },
    methods: {
        toggleDropdown() {
            if (this.isOpen) {
                this.closeDropdown();
                return;
            }
            this.isOpen = true;
            this.$nextTick(() => {
                const searchField = this.$el.querySelector('.combobox-search');
                if (searchField) {
                    try {
                        searchField.focus({ preventScroll: true });
                    } catch (e) {
                        searchField.focus();
                    }
                }
            });
        },
        closeDropdown() {
            if (!this.isOpen) return;
            this.isOpen = false;
            this.searchQuery = '';
        },
        toggleOption(option) {
            const index = this.internalValue.indexOf(option);
            if (index > -1) {
                this.internalValue.splice(index, 1);
            } else {
                this.internalValue.push(option);
            }
            this.$emit('input', [...this.internalValue]);
        },
        selectAll() {
            this.internalValue = [...this.options];
            this.$emit('input', [...this.internalValue]);
        },
        clearAll() {
            this.internalValue = [];
            this.$emit('input', []);
        },
        isSelected(option) {
            return this.internalValue.includes(option);
        },
        handleClickOutside(event) {
            if (!this.$el.contains(event.target)) {
                this.closeDropdown();
            }
        },
        getDescription(option) {
            const index = this.options.indexOf(option);
            return index !== -1 ? this.descriptions[index] : option;
        },
        getComboboxItemIconHtml(option) {
            let iconBaseClassName = null;
            switch (this.selectionType) {
                case 'bot':
                    iconBaseClassName = 'icon_bot';
                    break;
                case 'trend':
                    iconBaseClassName = 'icon_trend';
                    break;
                default:
                    return '';
            }

            const index = this.options.indexOf(option);
            if (index !== -1) {
                if (this.selectionType === 'bot') {
                    const itemSpecificClassName = this.$root.getModelIconClassName(option);
                    const botIconUrl = this.$root.getModelIconUrl(option);
                    const itemFullName = this.getDescription(option);
                    const botNameHtml = botIconUrl && botIconUrl.length > 0 ?
                        `<img src="${botIconUrl}" width="32" height="32" alt="${itemFullName}" class="">` :
                        itemFullName.charAt(0).toUpperCase();
                    return `<span class="has-data-hint ${iconBaseClassName} ${itemSpecificClassName}">
                        ${botNameHtml}
                    </span>`;
                } else if (this.selectionType === 'trend') {
                    return `<span
                        class="has-data-hint trend-icon ${this.$root.getTrendColorClass(option)} relative"
                        data-trend="${option}"
                    >
                        ${this.$root.getTrendSymbol(option)}
                    </span>`;
                }
            }
            return '';
        },
        getDisplayIconHtml() {
            // This method is no longer used - icons are handled in displayHtml computed property
            return '';
        }
    },
    template: `
    <base-component :obj="obj">
        <div class="relative" @keydown.esc.stop.prevent="closeDropdown()">
            <button
                type="button"
                class="combobox-trigger"
                :class="{'is-open': isOpen}"
                @click="toggleDropdown"
                :aria-expanded="isOpen ? 'true' : 'false'"
                aria-haspopup="listbox"
            >
                <span class="flex items-center gap-2 min-w-0 text-sm">
                    <span class="truncate flex items-center gap-1" v-html="displayHtml"></span>
                </span>
                <svg
                    class="combobox-chevron ml-2 h-4 w-4 transition-transform duration-150"
                    :class="{'rotate-180': isOpen}"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                >
                    <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.08 1.04l-4.25 4.25a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clip-rule="evenodd"></path>
                </svg>
            </button>
            <div
                v-if="isOpen"
                class="combobox-panel absolute z-10 w-full"
                role="listbox"
            >
                <input
                    v-model="searchQuery"
                    class="combobox-search"
                    type="text"
                    placeholder="Search..."
                    @keydown.stop
                    @keydown.esc.stop.prevent="closeDropdown()"
                >
                <div class="combobox-options">
                    <!-- Select All / Clear All buttons -->
                    <div class="combobox-select-all-bar">
                        <button @click="selectAll" type="button">
                            Select All
                        </button>
                        <span class="count-text">
                            {{ selectedCount }} of {{ options.length }}
                        </span>
                        <button @click="clearAll" type="button">
                            Clear All
                        </button>
                    </div>

                    <!-- Options with checkboxes -->
                    <div
                        v-for="option in filteredOptions"
                        :key="option"
                        @click="toggleOption(option)"
                        class="combobox-option flex items-center gap-3 px-3"
                        :class="{'is-selected': isSelected(option)}"
                        role="option"
                        :aria-selected="isSelected(option) ? 'true' : 'false'"
                    >
                        <!-- Checkbox -->
                        <input
                            type="checkbox"
                            :checked="isSelected(option)"
                            @click.stop="toggleOption(option)"
                        >
                        <!-- Icon -->
                        <span class="combobox-option-icon" v-html="getComboboxItemIconHtml(option)"></span>
                        <!-- Label -->
                        <span class="truncate flex-1">{{ getDescription(option) }}</span>
                    </div>
                </div>
            </div>
        </div>
    </base-component>
    `
});

Vue.component('brand-selector', {
    name: 'brand-selector',
    extends: baseProps,
    template: `
    <div class="brand-selector mb-6">
        <div class="relative">
            <!-- Search Input -->
            <div class="relative">
                <input 
                    v-model="$root.itemSearchQuery"
                    @focus="$root.showBrandDropdown = true"
                    @input="onSearchInput"
                    @keydown="handleKeydown"
                    type="text"
                    placeholder="Type to search and select items..."
                    class="w-full px-4 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                <button 
                    @click="toggleDropdown"
                    class="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                    </svg>
                </button>
            </div>
            
            <!-- Selected Brands Pills -->
            <div v-if="$root.selectedItems.length > 0" class="mt-2 flex flex-wrap gap-2">
                <div 
                    v-for="(brand, index) in $root.selectedItems" 
                    :key="\`selected-\${brand.entityType}-\${brand.value}\`"
                    :class="[
                        'inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm',
                        'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                    ]"
                >                
                    <span>{{ brand.value }}</span>
                    <button 
                        @click="removeBrand(index)"
                        :class="[
                            'ml-1',
                            index === 0 
                                ? 'hover:text-blue-200' 
                                : 'hover:text-gray-900 dark:hover:text-gray-100'
                        ]"
                    >
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>
            </div>
            
            <!-- Dropdown -->
            <div 
                v-if="$root.showBrandDropdown && filteredEntities.length > 0"
                class="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-64 overflow-y-auto"
            >
                <div 
                    v-for="(entity, index) in filteredEntities" 
                    :key="\`option-\${entity.entityType}-\${entity.value}\`"
                    @click="selectBrand(entity)"
                    :class="[
                        'px-4 py-2 cursor-pointer transition-colors',
                        isSelected(entity) ? 'bg-blue-50 dark:bg-blue-900/30' : 'hover:bg-gray-100 dark:hover:bg-gray-700',
                        highlightedIndex === index ? 'bg-gray-100 dark:bg-gray-700' : ''
                    ]"
                >
                    <div class="flex items-center justify-between">
                        <div>
                            <div class="font-medium text-gray-900 dark:text-gray-100">{{ entity.value }}</div>
                            <div class="text-sm text-gray-500 dark:text-gray-400">
                                {{ entity.entityTypeLabel }} • {{ entity.mentions }} mentions
                            </div>
                        </div>
                        <div v-if="isSelected(entity)" class="text-blue-600 dark:text-blue-400">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                            </svg>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Comparison Mode Indicator -->
        <!--
        <p v-if="$root.selectedItems.length > 1" class="mt-2 text-sm text-blue-600 dark:text-blue-400">

            <svg class="inline w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
            </svg>
            Important items mode active • Highlighting {{ $root.selectedItems.length }} items
        </p>
        -->
    </div>
    `,
    data() {
        return {
            highlightedIndex: -1
        };
    },
    computed: {
        filteredEntities() {
            const query = this.$root.itemSearchQuery.toLowerCase();
            if (!query) {
                return this.$root.getAllEntities.slice(0, 50); // Show top 50 when no search
            }

            return this.$root.getAllEntities.filter(entity => {
                return entity.value.toLowerCase().includes(query) ||
                    entity.entityTypeLabel.toLowerCase().includes(query);
            }).slice(0, 50); // Limit results
        }
    },
    mounted() {
        // Close dropdown when clicking outside
        document.addEventListener('click', this.handleClickOutside);

        // Initialize from localStorage or brand.md
        this.initializeSelection();
    },
    beforeDestroy() {
        document.removeEventListener('click', this.handleClickOutside);
    },
    methods: {
        initializeSelection() {
            // Skip initialization if brands are already selected (e.g., from parent component)
            if (this.$root.selectedItems.length > 0) {
                return;
            }

            const savedBrands = localStorage.getItem('selectedBrandIds');
            if (savedBrands) {
                try {
                    const brandIds = JSON.parse(savedBrands);
                    brandIds.forEach(id => {
                        const [entityType, ...valueParts] = id.split('-');
                        const entityValue = valueParts.join('-');
                        const entity = this.$root[entityType]?.find(item => item.value === entityValue);
                        if (entity && !this.isSelected(entity)) {
                            this.$root.selectedItems.push({
                                ...entity,
                                entityType: entityType
                            });
                        }
                    });
                } catch (e) {
                    console.warn('Failed to restore brand selection');
                }
            }
        },
        toggleDropdown() {
            this.$root.showBrandDropdown = !this.$root.showBrandDropdown;
        },
        onSearchInput() {
            this.$root.showBrandDropdown = true;
            this.highlightedIndex = -1;
        },
        handleKeydown(event) {
            if (!this.$root.showBrandDropdown) return;

            switch (event.key) {
                case 'ArrowDown':
                    event.preventDefault();
                    this.highlightedIndex = Math.min(this.highlightedIndex + 1, this.filteredEntities.length - 1);
                    break;
                case 'ArrowUp':
                    event.preventDefault();
                    this.highlightedIndex = Math.max(this.highlightedIndex - 1, 0);
                    break;
                case 'Enter':
                    event.preventDefault();
                    if (this.highlightedIndex >= 0 && this.highlightedIndex < this.filteredEntities.length) {
                        this.selectBrand(this.filteredEntities[this.highlightedIndex]);
                    }
                    break;
                case 'Escape':
                    this.$root.showBrandDropdown = false;
                    this.highlightedIndex = -1;
                    break;
            }
        },
        selectBrand(entity) {
            if (!this.isSelected(entity)) {
                this.$root.selectedItems.push({
                    ...entity,
                    entityType: entity.entityType
                });
                this.saveBrandSelection();
            } else {
                // Remove if already selected
                const index = this.$root.selectedItems.findIndex(b =>
                    b.entityType === entity.entityType && b.value === entity.value
                );
                if (index > -1) {
                    this.$root.selectedItems.splice(index, 1);
                    this.saveBrandSelection();
                }
            }
            this.$root.itemSearchQuery = '';
            this.highlightedIndex = -1;
        },
        removeBrand(index) {
            this.$root.selectedItems.splice(index, 1);
            this.saveBrandSelection();
        },
        isSelected(entity) {
            return this.$root.selectedItems.some(b =>
                b.entityType === entity.entityType && b.value === entity.value
            );
        },
        saveBrandSelection() {
            const brandIds = this.$root.selectedItems.map(b => `${b.entityType}-${b.value}`);
            localStorage.setItem('selectedBrandIds', JSON.stringify(brandIds));
        },
        handleClickOutside(event) {
            if (!this.$el.contains(event.target)) {
                this.$root.showBrandDropdown = false;
            }
        }
    }
});


Vue.component('top-influencers', {
    name: 'top-influencers',
    extends: baseProps,
    data() {
        return {
            // sort by mentions by default
            sortColumn: 'mentions',
            sortDirection: 'desc' // 'asc' or 'desc'
        };
    },
    mounted() {
        // Auto-populate with top influencers on load if no selected
        if (this.$root.selectedItems.length === 0 && this.topInfluencers.length > 0) {
            // push top influencers to selectedItems to select by default
            this.topInfluencers.forEach(item => {
                this.$root.selectedItems.push(item);
            });            
        }
    },
    computed: {
        showComparison() {
            // Show if manually selected 2+ items OR if we have auto-populated top influencers
            return this.$root.selectedItems.length >= 1 || (this.$root.selectedItems.length === 0 && this.topInfluencers.length > 0);
        },
        topInfluencers() {
            // Get top influencers from each entity category
            const topItems = [];

            ENTITES_ALL.forEach(entityType => {
                const items = this.$root[entityType];
                if (items && Array.isArray(items) && items.length > 0) {
                    // Sort by influence and take top N
                    const sortedItems = [...items]
                        .filter(item => item.influence > 0) // Only items with influence
                        .sort((a, b) => (b.influence || 0) - (a.influence || 0))
                        .slice(0, TOP_INFLUENCERS_COUNT_PER_SECTION);

                    // Add entityType to each item for proper navigation
                    sortedItems.forEach(item => {
                        topItems.push({
                            ...item,
                            entityType: entityType.replace(/s$/, '') // Singular form
                        });
                    });
                }
            });

            // Sort all top items by influence and limit to 7 total
            return topItems
                .sort((a, b) => (b.influence || 0) - (a.influence || 0))
                .slice(0, 7);
        },
        comparisonBrands() {
            // If no manual selection, show top influencers
            if (this.$root.selectedItems.length === 0) {
                return this.topInfluencers;
            }
            return this.$root.selectedItems; // Limit to 5 brands for comparison
        },

        comparisonMetrics() {
            if (!this.showComparison) return [];

            return this.comparisonBrands.map(brand => {
                const mentioningEngines = new Set();
                if (brand.bots) {
                    brand.bots.split(',').forEach(bot => {
                        if (bot) mentioningEngines.add(bot);
                    });
                }

                // Handle influence value - check if it's already a percentage (>1) or decimal (0-1)
                let influenceValue = brand.influence || 0;
                if (influenceValue <= 1) {
                    // It's a decimal, convert to percentage
                    influenceValue = influenceValue * 100;
                }
                // If it's already > 1, it's already a percentage

                const val = brand.value || brand.link;

                return {
                    id: `${brand.entityType}-${val}`.replace(/s$/, '_'),
                    value: val,
                    type: brand.entityType,
                    mentions: brand.mentions || 0,
                    influence: influenceValue,
                    trend: brand.appearanceOrderTrend,
                    mentionsChange: brand.mentions_change || 0,
                    coverage: this.$root.bots ? (mentioningEngines.size / this.$root.bots.length) * 100 : 0,
                    engineCount: mentioningEngines.size,
                    // Additional data for tooltips
                    totalEngines: this.$root.bots ? this.$root.bots.length : 0,
                    mentionsByModel: brand.mentionsByModel || {},
                    influenceByModel: brand.influenceByModel || {}
                };
            });
        },

        maxMentions() {
            return Math.max(...this.comparisonMetrics.map(m => m.mentions), 1);
        },

        maxInfluence() {
            return Math.max(...this.comparisonMetrics.map(m => m.influence), 1);
        },
        sortedComparisonMetrics() {
            if (!this.sortColumn) {
                return this.comparisonMetrics;
            }


            const sorted = [...this.comparisonMetrics].sort((a, b) => {
                let aVal = a[this.sortColumn];
                let bVal = b[this.sortColumn];

                // Handle special cases
                if (this.sortColumn === 'value' || this.sortColumn === 'type') {
                    aVal = aVal.toLowerCase();
                    bVal = bVal.toLowerCase();
                }

                // Numeric comparison
                if (typeof aVal === 'number' && typeof bVal === 'number') {
                    return this.sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
                }

                // String comparison
                if (this.sortDirection === 'asc') {
                    return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
                } else {
                    return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
                }
            });

            return sorted;
        },

        mentionsSortedMetrics() {
            // Always sort by mentions from high to low for visual chart
            return [...this.comparisonMetrics].sort((a, b) => b.mentions - a.mentions);
        },

        influenceSortedMetrics() {
            // Always sort by influence from high to low for visual chart
            return [...this.comparisonMetrics].sort((a, b) => b.influence - a.influence);
        }

    },
    methods: {
        getTrendDisplay(trend) {
            return this.$root.getTrendSymbol(trend);
        },
        getTrendClass(trend) {
            if (trend === 10) return 'text-green-500'; // UP
            if (trend === -1) return 'text-red-500'; // DOWN
            if (trend === 999) return 'text-purple-500'; // NEW
            return 'text-gray-400';
        },
        getChangeClass(change) {
            return change >= 0 ? 'text-green-600' : 'text-red-600';
        },
        scrollToEntitySection(entityType) {
            this.$root.scrollToElement(getEntityTableSectionId(entityType));
        },
        sortBy(column) {
            if (this.sortColumn === column) {
                // Toggle direction if same column
                this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                // New column, default to descending for numeric columns
                this.sortColumn = column;
                this.sortDirection = [
                    'mentions',

                    'influence',

                    'mentionsChange'
                ].includes(column) ? 'desc' : 'asc';
            }
        },
        getSortIndicator(column) {
            if (this.sortColumn !== column) return '';
            return this.sortDirection === 'asc' ? ' ↑' : ' ↓';
        }
    },
    template: `
    <base-section-component :obj="obj" :section-title="'Top Influencers'">
        <div class="top-influencers">
            <brand-selector :obj="obj"></brand-selector>

            <!-- Top Influencers Info when auto-populated -->
            <div v-if="$root.selectedItems.length === 0 && topInfluencers.length > 0" class="mb-6 p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
                <div class="flex items-start gap-3">
                    <svg class="w-5 h-5 text-purple-600 dark:text-purple-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                    <div>
                        <p class="text-sm text-purple-800 dark:text-purple-200 font-medium">Showing top performers across all categories</p>
                        <p class="text-sm text-purple-600 dark:text-purple-300 mt-1">These are the highest-influence items from each section. Click any item to jump to its section, or select specific items above to compare them side by side.</p>
                    </div>
                </div>
            </div>

            <!-- Help Message when no data available -->
            <div v-if="$root.selectedItems.length === 0 && topInfluencers.length === 0" class="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <div class="flex items-start gap-3">
                    <svg class="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                    <div>
                        <p class="text-sm text-blue-800 dark:text-blue-200 font-medium">Select items to analyze and compare</p>
                        <p class="text-sm text-blue-600 dark:text-blue-300 mt-1">Choose one item to compare with top influencers.</p>
                    </div>
                </div>
            </div>             
            
            <!-- Comparison Table -->
            <div v-if="showComparison" class="overflow-x-auto">
                <table class="w-full report-table">
                    <thead>
                        <tr class="border-b border-gray-200 dark:border-gray-700">
                            <th @click="sortBy('value')" class="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                                Item{{ getSortIndicator('value') }}
                            </th>
                            <th @click="sortBy('type')" class="text-center py-3 px-4 font-semibold text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                                Type{{ getSortIndicator('type') }}
                            </th>
                            <th @click="sortBy('mentions')" class="text-center py-3 px-4 font-semibold text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                                Mentions{{ getSortIndicator('mentions') }}
                            </th>
                            
                            <th @click="sortBy('influence')" class="text-center py-3 px-4 font-semibold text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                                Influence{{ getSortIndicator('influence') }}
                            </th>
                            
                            <th @click="sortBy('coverage')" class="text-center py-3 px-4 font-semibold text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                                Coverage{{ getSortIndicator('coverage') }}
                            </th>
                            <th @click="sortBy('trend')" class="text-center py-3 px-4 font-semibold text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                                Trend{{ getSortIndicator('trend') }}
                            </th>
                            <th @click="sortBy('mentionsChange')" class="text-center py-3 px-4 font-semibold text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                                Change{{ getSortIndicator('mentionsChange') }}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="(metric, index) in sortedComparisonMetrics" 
                            :key="metric.id"
                            :class="[
                                'border-b border-gray-200 dark:border-gray-700',
                                comparisonBrands[0] && metric.value === comparisonBrands[0].value ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                            ]"
                        >
                            <td class="py-3 px-4 font-medium text-gray-900 dark:text-white">
                                <span 
                                    :class="['comparison-term-clickable', $root.getHighlightClass(metric.id)]"
                                    @click="scrollToEntitySection(metric.type)"
                                    :title="'Click to scroll to ' + metric.type + ' section'"
                                >{{ metric.value }}</span>                                
                            </td>
                            <td class="text-center py-3 px-4 text-sm text-gray-600 dark:text-gray-400 capitalize">
                                <span 
                                    :class="['comparison-term-clickable', $root.getHighlightClass(metric.id)]"
                                    @click="scrollToEntitySection(metric.type)"
                                    :title="'Click to scroll to ' + metric.type + ' section'"
                                >{{ metric.type }}</span>
                            </td>
                            <td class="text-center py-3 px-4">
                                <div class="relative">
                                    <div class="inline-flex items-center gap-1">
                                        <span>{{ metric.mentions }}</span>
                                        <div class="relative group">
                                            <svg class="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-help" 
                                                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                                                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                            </svg>
                                            <div class="absolute z-50 invisible group-hover:visible bg-gray-800 dark:bg-gray-900 text-white text-xs rounded-lg p-3 bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-48 shadow-lg">
                                                <div class="font-semibold mb-2">Mentions Breakdown:</div>
                                                <div class="space-y-1 text-left">
                                                    <div>Total times mentioned across all AI engines in response to the questions</div>
                                                </div>
                                                <div class="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-full">
                                                    <div class="border-8 border-transparent border-t-gray-800 dark:border-t-gray-900"></div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="mt-1 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1">
                                        <div class="bg-blue-500 dark:bg-blue-400 h-1 rounded-full" 
                                            :style="\`width: \${(metric.mentions / maxMentions) * 100}%\`">
                                        </div>
                                    </div>
                                </div>
                            </td>
                            <td class="text-center py-3 px-4">
                                <div class="relative">
                                    <div class="inline-flex items-center gap-1">
                                        <span>{{ metric.influence.toFixed(1) }}%</span>
                                        <div class="relative group">
                                            <svg class="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-help" 
                                                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                                                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                            </svg>
                                            <div class="absolute z-50 invisible group-hover:visible bg-gray-800 dark:bg-gray-900 text-white text-xs rounded-lg p-3 bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 shadow-lg">
                                                <div class="font-semibold mb-2">How Influence is Calculated:</div>
                                                <div class="space-y-1 text-left">
                                                    <div>• Total mentions: {{ metric.mentions }}</div>
                                                    <div>• Weighted by AI engine importance</div>
                                                    <div>• Higher weight for engines with more users</div>
                                                    <div class="mt-2 pt-2 border-t border-gray-600">
                                                        <div class="font-semibold mb-1">Mentions by Engine:</div>
                                                        <div v-for="(count, model) in metric.mentionsByModel" :key="model" class="text-xs">
                                                            {{ model }}: {{ count }}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div class="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-full">
                                                    <div class="border-8 border-transparent border-t-gray-800 dark:border-t-gray-900"></div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="mt-1 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1">
                                        <div class="bg-purple-500 dark:bg-purple-400 h-1 rounded-full" 
                                            :style="\`width: \${(metric.influence / maxInfluence) * 100}%\`">
                                        </div>
                                    </div>
                                </div>
                            </td>
                            <td class="text-center py-3 px-4">
                                <div class="relative">
                                    <div class="inline-flex items-center gap-1">
                                        <div class="text-sm">
                                            <div>{{ metric.coverage.toFixed(0) }}%</div>
                                            <div class="text-xs text-gray-500">{{ metric.engineCount }} engines</div>
                                        </div>
                                        <div class="relative group">
                                            <svg class="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-help" 
                                                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                                                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                            </svg>
                                            <div class="absolute z-50 invisible group-hover:visible bg-gray-800 dark:bg-gray-900 text-white text-xs rounded-lg p-3 bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-56 shadow-lg">
                                                <div class="font-semibold mb-2">Coverage Calculation:</div>
                                                <div class="space-y-1 text-left">
                                                    <div>• Mentioned by {{ metric.engineCount }} of {{ metric.totalEngines }} AI engines</div>
                                                    <div>• Coverage = ({{ metric.engineCount }} / {{ metric.totalEngines }}) × 100%</div>
                                                    <div>• Higher coverage indicates broader recognition</div>
                                                </div>
                                                <div class="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-full">
                                                    <div class="border-8 border-transparent border-t-gray-800 dark:border-t-gray-900"></div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </td>
                            <td class="text-center py-3 px-4">
                                <span :class="getTrendClass(metric.trend)" class="text-xl">
                                    {{ getTrendDisplay(metric.trend) }}
                                </span>
                            </td>
                            <td class="text-center py-3 px-4">
                                <span :class="getChangeClass(metric.mentionsChange)">
                                    {{ metric.mentionsChange >= 0 ? '+' : '' }}{{ metric.mentionsChange }}%
                                </span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            
            <!-- Visual Comparison Charts -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                <!-- Mentions Comparison -->
                <div class="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                    <h4 class="text-lg font-semibold mb-4 text-gray-800 dark:text-white">Mention Volume</h4>
                    <div class="space-y-3">
                        <div v-for="(metric, index) in mentionsSortedMetrics" :key="'mentions-' + metric.id" class="flex items-center">
                            <div class="w-32 text-sm text-gray-600 dark:text-gray-400 truncate" :title="metric.value">
                                <span 
                                    :class="['comparison-term-clickable']"
                                    @click="scrollToEntitySection(metric.type)"
                                    :title="'Click to scroll to ' + metric.type + ' section'"
                                >{{ metric.value }}</span>
                            </div>
                            <div class="flex-1 ml-3 relative">
                                <div class="bg-gray-200 dark:bg-gray-700 rounded-full h-6">
                                    <div :class="'bg-gray-500 dark:bg-gray-400'"
                                        class="h-6 rounded-full"
                                        :style="\`width: \${(metric.mentions / maxMentions) * 100}%\`">
                                    </div>
                                </div>
                                <!-- Number positioned absolutely based on bar width -->
                                <span
                                    :class="[
                                        'text-xs font-medium absolute top-0 h-6 flex items-center',
                                        'text-white'                                        
                                    ]"
                                    :style="'right: 0.5rem'"
                                >
                                    {{ metric.mentions }}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
                
                
                <!-- Influence Comparison -->
                <div class="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                    <h4 class="text-lg font-semibold mb-4 text-gray-800 dark:text-white">Influence Score</h4>
                    <div class="space-y-3">
                        <div v-for="(metric, index) in influenceSortedMetrics" :key="'influence-' + metric.id" class="flex items-center">
                            <div class="w-32 text-sm text-gray-600 dark:text-gray-400 truncate" :title="metric.value">
                                <span 
                                    :class="['comparison-term-clickable']"
                                    @click="scrollToEntitySection(metric.type)"
                                    :title="'Click to scroll to ' + metric.type + ' section'"
                                >{{ metric.value }}</span>
                            </div>
                            <div class="flex-1 ml-3 relative">
                                <div class="bg-gray-200 dark:bg-gray-700 rounded-full h-6">
                                    <div :class="'bg-purple-500 dark:bg-purple-400'"
                                        class="h-6 rounded-full"
                                        :style="\`width: \${(metric.influence / maxInfluence) * 100}%\`">
                                    </div>
                                </div>
                                <!-- Number positioned absolutely based on bar width -->
                                <span
                                    :class="[
                                        'text-xs font-medium absolute top-0 h-6 flex items-center',
                                        (metric.influence / maxInfluence) >= 0.15
                                            ? 'text-white'
                                            : 'text-gray-700 dark:text-gray-300 left-full ml-2'
                                    ]"
                                    :style="(metric.influence / maxInfluence) >= 0.15 ? \`right: 0.5rem\` : \`\`"
                                >
                                    {{ metric.influence.toFixed(1) }}%
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
                
            </div>
        </div>
    </base-section-component>
    `
});


Vue.component('competitive-analysis', {
    name: 'competitive-analysis',
    extends: baseProps,
    computed: {
        topCompetitors() {
            if (!this.$root.selectedItems.length) {
                return [];
            }

            const brand = this.$root.selectedItems[0];
            const brandType = brand.entityType;

            // Get entities from the same category as the selected brand
            let entities = [...(this.$root[brandType] || [])];

            // Filter out the selected brand
            entities = entities.filter(entity => entity.value !== brand.value);

            // Get top 5 competitors by influence
            return entities.slice(0, 5).map(entity => {
                // Handle influence value - check if it's already a percentage (>1) or decimal (0-1)
                let influenceValue = entity.influence || 0;
                if (influenceValue <= 1) {
                    // It's a decimal, convert to percentage
                    influenceValue = influenceValue * 100;
                }
                // If it's already > 1, it's already a percentage

                return {
                    name: entity.value,
                    mentions: entity.mentions || 0,
                    influence: influenceValue,
                    trend: entity.appearanceOrderTrend,
                    mentionsChange: entity.mentions_change || 0,
                    link: entity.link
                };
            });
        },
        brandMetrics() {
            if (!this.$root.selectedItems.length) {
                return {
                    name: 'Select an item',
                    mentions: 0,
                    influence: 0,
                    trend: 0,
                    mentionsChange: 0
                };
            }

            const brand = this.$root.selectedItems[0];

            // Handle influence value - check if it's already a percentage (>1) or decimal (0-1)
            let influenceValue = brand.influence || 0;
            if (influenceValue <= 1) {
                // It's a decimal, convert to percentage
                influenceValue = influenceValue * 100;
            }
            // If it's already > 1, it's already a percentage

            return {
                name: brand.value,
                mentions: brand.mentions || 0,
                influence: influenceValue,
                trend: brand.appearanceOrderTrend,
                mentionsChange: brand.mentions_change || 0,
                link: brand.link
            };
        },
        competitiveInsights() {
            const insights = [];

            // Check if brand is leading
            if (this.brandMetrics.influence > 0 && this.topCompetitors.length > 0) {
                const leadingCompetitor = this.topCompetitors[0];
                if (this.brandMetrics.influence > leadingCompetitor.influence) {
                    insights.push({
                        type: 'positive',
                        text: `Leading market position with ${this.brandMetrics.influence.toFixed(1)}% influence`
                    });
                } else {
                    insights.push({
                        type: 'warning',
                        text: `${leadingCompetitor.value} leads with ${leadingCompetitor.influence.toFixed(1)}% influence`
                    });
                }
            }

            // Check for rising competitors
            const risingCompetitors = this.topCompetitors.filter(c => c.trend === 10); // UP trend
            if (risingCompetitors.length > 0) {
                insights.push({
                    type: 'alert',
                    text: `${risingCompetitors.length} competitor(s) showing growth trends`
                });
            }

            return insights;
        }
    },
    methods: {
        getTrendDisplay(trend) {
            return this.$root.getTrendSymbol(trend);
        },
        getTrendClass(trend) {
            if (trend === 10) return 'text-green-500'; // UP
            if (trend === -1) return 'text-red-500'; // DOWN
            if (trend === 999) return 'text-purple-500'; // NEW
            return 'text-gray-400';
        }
    },
    template: `
    <base-section-component :obj="obj">
        <div class="competitive-analysis">
            <h2 class="text-3xl font-bold mb-6 text-gray-800 dark:text-white">Competitive Analysis</h2>
            
            <!-- Competitive Overview -->
            <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden mb-8">
                <div class="bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-4">
                    <h3 class="text-xl font-semibold text-white">Market Position Overview</h3>
                </div>
                
                <div class="p-6">
                    <!-- Brand vs Competitors Table -->
                    <table class="w-full report-table">
                        <thead>
                            <tr class="border-b border-gray-200 dark:border-gray-700">
                                <th class="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Organization</th>
                                <th class="text-center py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Mentions</th>
                                <th class="text-center py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Influence</th>
                                <th class="text-center py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Trend</th>                                
                                <th class="text-center py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Change</th>
                            </tr>
                        </thead>
                        <tbody>
                            <!-- Brand Row (highlighted) -->
                            <tr class="bg-blue-50 dark:bg-blue-900/20 border-b border-gray-200 dark:border-gray-700">
                                <td class="py-3 px-4 font-medium text-gray-900 dark:text-white">
                                    <span :class="$root.getHighlightClass(brandMetrics.value)">{{ brandMetrics.value }}</span> <span class="text-xs text-blue-600 dark:text-blue-400">(You)</span>
                                </td>
                                <td class="text-center py-3 px-4 font-medium">{{ brandMetrics.mentions }}</td>
                                <td class="text-center py-3 px-4">
                                    <div class="inline-flex items-center">
                                        <div class="w-20 bg-gray-200 dark:bg-gray-700 rounded-full h-2 mr-2">
                                            <div class="bg-blue-500 dark:bg-blue-400 h-2 rounded-full" :style="\`width: \${brandMetrics.influence}%\`"></div>
                                        </div>
                                        <span class="text-sm font-medium">{{ brandMetrics.influence.toFixed(1) }}%</span>
                                    </div>
                                </td>
                                <td class="text-center py-3 px-4">
                                    <span :class="getTrendClass(brandMetrics.trend)" class="text-xl">
                                        {{ getTrendDisplay(brandMetrics.trend) }}
                                    </span>
                                </td>
                                <td class="text-center py-3 px-4">
                                    <span :class="brandMetrics.mentionsChange >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
                                        {{ brandMetrics.mentionsChange >= 0 ? '+' : '' }}{{ brandMetrics.mentionsChange }}
                                    </span>
                                </td>
                            </tr>
                            
                            <!-- Competitor Rows -->
                            <tr v-for="(comp, index) in topCompetitors" :key="comp.id" 
                                class="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                                <td class="py-3 px-4 text-gray-900 dark:text-white">
                                    <a v-if="comp.link" :href="comp.link" target="_blank" class="hover:underline">
                                        <span :class="$root.getHighlightClass(comp.value)">{{ comp.value }}</span>
                                    </a>
                                    <span v-else :class="$root.getHighlightClass(comp.value)">{{ comp.value }}</span>
                                </td>
                                <td class="text-center py-3 px-4">{{ comp.mentions }}</td>
                                <td class="text-center py-3 px-4">
                                    <div class="inline-flex items-center">
                                        <div class="w-20 bg-gray-200 dark:bg-gray-700 rounded-full h-2 mr-2">
                                            <div class="bg-gray-500 dark:bg-gray-400 h-2 rounded-full" :style="\`width: \${comp.influence}%\`"></div>
                                        </div>
                                        <span class="text-sm">{{ comp.influence.toFixed(1) }}%</span>
                                    </div>
                                </td>
                                <td class="text-center py-3 px-4">
                                    <span :class="getTrendClass(comp.trend)" class="text-xl">
                                        {{ getTrendDisplay(comp.trend) }}
                                    </span>
                                </td>
                                <td class="text-center py-3 px-4">
                                    <span :class="comp.mentionsChange >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
                                        {{ comp.mentionsChange >= 0 ? '+' : '' }}{{ comp.mentionsChange }}
                                    </span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
            
            <!-- Competitive Insights -->
            <div class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-6">
                <h3 class="text-lg font-semibold text-yellow-900 dark:text-yellow-300 mb-3 flex items-center">
                    <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path>
                    </svg>
                    Competitive Insights
                </h3>
                <ul class="space-y-2">
                    <li v-for="(insight, index) in competitiveInsights" :key="index" class="flex items-start">
                        <span :class="{
                            'text-green-500': insight.type === 'positive',
                            'text-orange-500': insight.type === 'warning',
                            'text-red-500': insight.type === 'alert'
                        }" class="mr-2">•</span>
                        <span class="text-gray-700 dark:text-gray-300">{{ insight.text }}</span>
                    </li>
                </ul>
            </div>
        </div>
    </base-section-component>
    `
});


Vue.component('empty-section', {
    name: 'empty-section',
    extends: baseProps,
    template: `
    <base-section-component :obj="obj" :is-section="true" :section-title="obj.title" :is-empty-section="true">
        <!-- No content needed - everything is in the header -->
    </base-section-component>
    `
});


document.addEventListener('DOMContentLoaded', function () {

    // Vue instance
    const app = new Vue({
        el: '#app',
        data: function () {

            const create_current_filtered_counts_variables = get_DEFAULT_VISUAL_OBJECTS_ARRAY().filter(obj => (obj.hasSearchFilter || obj.hasModelFilter || obj.hasTrendFilter)).reduce((acc, obj) => ({
                ...acc,
                [`current_filtered_count_${obj.id}`]: -1
            }), {});

            const create_total_counts_variables = get_DEFAULT_VISUAL_OBJECTS_ARRAY().reduce((acc, obj) => ({
                ...acc,
                [`total_count_${obj.id}`]: -1
            }), {});


            const create_current_visible_items_count_variables = get_DEFAULT_VISUAL_OBJECTS_ARRAY().filter(obj => obj.type === 'table-with-items').reduce((acc, obj) => ({
                ...acc,
                [`current_visible_items_count_${obj.id}`]: -1
            }), {});

            const create_searchTerms_variables = get_DEFAULT_VISUAL_OBJECTS_ARRAY().filter(obj => obj.hasSearchFilter).reduce((acc, obj) => ({
                ...acc,
                [`${obj.id}_searchTerm`]: ''
            }), {});

            const create_selected_AIModels_variables = get_DEFAULT_VISUAL_OBJECTS_ARRAY().filter(obj => obj.hasModelFilter).reduce((acc, obj) => ({
                ...acc,
                [`selected_${obj.id}_AIModels`]: []  // Changed to empty array for multi-select
            }), {});


            const create_selected_Trends_variables = get_DEFAULT_VISUAL_OBJECTS_ARRAY().filter(obj => obj.hasAppearanceOrderTrendFilter).reduce((acc, obj) => ({
                ...acc,
                [`selected_${obj.id}_appearanceOrder_Trends`]: []  // Changed to empty array for multi-select
            }), {});


            // array of graph simulation variables for charts
            const create_simulation_graph_variables = get_DEFAULT_VISUAL_OBJECTS_ARRAY().filter(obj => obj.type === 'graph-with-items').reduce((acc, obj) => ({
                ...acc,
                [`simulation_${obj.id}`]: null
            }), {});

            return {

                ALL_MODELS_OPTION_CAPTION: 'All',

                ALL_TRENDS_OPTION_CAPTION: 'All Trends',


                // sort visual objects by title, but only for those with sourceArrayName
                CURRENT_VISUAL_OBJECTS_ARRAY: (function () {
                    // Transform get_DEFAULT_VISUAL_OBJECTS_ARRAY() to group table/graph pairs into tabbed components
                    const transformedArray = [];
                    const processedIds = new Set();

                    // First, always add the about-report component at the beginning
                    const aboutReport = get_DEFAULT_VISUAL_OBJECTS_ARRAY().find(obj => obj.type === 'about-report');
                    if (aboutReport) {
                        transformedArray.push(aboutReport);
                        processedIds.add(aboutReport.id);
                    }

                    for (const obj of get_DEFAULT_VISUAL_OBJECTS_ARRAY()) {
                        // Skip if already processed
                        if (processedIds.has(obj.id)) continue;

                        // Check if this is a table with a corresponding graph
                        if (obj.type === 'table-with-items' && obj.sourceArrayName) {
                            // Look for matching graph
                            const graphObj = get_DEFAULT_VISUAL_OBJECTS_ARRAY().find(
                                g => g.type === 'graph-with-items' &&
                                    g.sourceArrayName === obj.sourceArrayName
                            );

                            if (graphObj) {
                                // Create tabbed component combining both
                                transformedArray.push({
                                    id: `tabbed_${obj.sourceArrayName}`,
                                    type: 'tabbed-table-graph',
                                    title: obj.title.replace(' Table', '').replace(' Graph', ''),
                                    description: obj.description,
                                    sourceArrayName: obj.sourceArrayName,
                                    tableConfig: obj,
                                    graphConfig: graphObj,
                                    tocPath: obj.tocPath ? obj.tocPath.split('/')[0] : undefined
                                });

                                // Mark both as processed
                                processedIds.add(obj.id);
                                processedIds.add(graphObj.id);
                            } else {
                                // No matching graph, keep table as-is
                                transformedArray.push(obj);
                                processedIds.add(obj.id);
                            }
                        } else if (!processedIds.has(obj.id)) {
                            // Not a table or already processed, keep as-is
                            transformedArray.push(obj);
                            processedIds.add(obj.id);
                        }
                    }

                    return transformedArray;
                })(),
                // Merge data from appropriate source
                ...(function () {
                    // First look for date-specific variables (AppData20250719 or AppDataAggregate20250719) - these have enriched data
                    const appDataKeys = Object.keys(window).filter(key =>
                        key.startsWith('AppData') && (key.match(/AppData\d{8}$/) || key.match(/AppDataAggregate\d{8}$/))
                    );

                    let appData = null;
                    let appDataKey = '';

                    if (appDataKeys.length > 0) {
                        // Use the first matching key (there should only be one)
                        appDataKey = appDataKeys[0];
                        appData = window[appDataKey];
                        console.log(`Using ${appDataKey} for data (has enriched properties)`);
                    } else if (window.AppData) {
                        // Fallback to window.AppData (used by aggregate reports, may lack enriched properties)
                        appData = window.AppData;
                        appDataKey = 'AppData';
                        console.log('Using window.AppData directly (fallback, may lack enriched data)');
                    } else {
                        console.warn('No AppData variables found');
                        return {};
                    }

                    // Deep clone the data to prevent Vue reactivity issues that corrupt object properties
                    return JSON.parse(JSON.stringify(appData));
                })(),
                // Merge static data (but preserve prompts array if it already exists)
                ...(function () {
                    // Try to find AppDataStatic with or without date suffix
                    const staticDataKey = Object.keys(window).find(key => key.startsWith('AppDataStatic'));
                    if (!staticDataKey) return {};

                    const staticData = window[staticDataKey];
                    const mergedData = (function () {
                        // First check if window.AppData exists (used by aggregate reports)
                        if (window.AppData) {
                            return window.AppData;
                        }

                        // Otherwise look for date-specific variables
                        const appDataKeys = Object.keys(window).filter(key =>
                            key.startsWith('AppData') && (key.match(/AppData\d{8}$/) || key.match(/AppDataAggregate\d{8}$/))
                        );

                        if (appDataKeys.length === 0) {
                            return {};
                        }

                        return window[appDataKeys[0]];
                    })();

                    // If we already have a prompts array from the main data, don't overwrite it
                    const { prompts: staticPrompts, ...otherStaticData } = staticData;

                    // Only include static prompts if main data doesn't have prompts
                    if (mergedData.prompts && Array.isArray(mergedData.prompts)) {
                        return otherStaticData;
                    }

                    // Deep clone the data to prevent Vue reactivity issues that corrupt object properties
                    return JSON.parse(JSON.stringify(staticData));
                })(),
                // Other local data properties can be added here
                ...create_simulation_graph_variables,
                minDensity: 0,
                maxDensity: 100,
                // count for every unique array used in get_DEFAULT_VISUAL_OBJECTS_ARRAY()
                ...create_total_counts_variables,
                // to save currently filtered links
                ...create_current_filtered_counts_variables,
                // for showing more buttons in tables
                // max visible items in tables
                ...create_current_visible_items_count_variables,
                // for tables: creating variables for each array name
                ...create_searchTerms_variables,

                showSharePopup: false,
                isDarkMode: localStorage.getItem('aicwDarkMode') === 'true',

                // Other local data properties
                showPromptModal: false,
                modalContent: '',
                modalType: '',
                modalTitle: '',
                // for tables: creating variables for each array name
                ...create_selected_AIModels_variables,

                // for tables: creating trends variables for each array name
                ...create_selected_Trends_variables,

                // for graphs: creating top items limit variables
                ...get_DEFAULT_VISUAL_OBJECTS_ARRAY().filter(obj => obj.type === 'graph-with-items').reduce((acc, obj) => ({
                    ...acc,
                    [`${obj.id}_topItemsLimit`]: DEFAULT_GRAPH_NODE_LIMIT // default
                }), {}),

                // Default values that should not override merged data
                selectedPromptFilter: 'all', // for filtering by prompt in aggregate view

                // Dynamic brand selection
                selectedItems: [], // Array of selected brand objects
                itemSearchQuery: '', // Search query for brand selector
                showBrandDropdown: false, // Control dropdown visibility
                defaultBrand: null // Store the original brand from brand.md for reference
            }
        },


        mounted() {

            // sort bots by default order A-Z
            this.bots = this.bots.sort((a, b) => a.id.localeCompare(b.id));

            // Set defaults for report_type and isAggregateReport if not already set
            if (!this.report_type) {
                this.report_type = 'standard';
            }

            // Check if this is an aggregate report
            this.isAggregateReport = this.report_type === 'aggregate';

            // Initialize brand selection
            this.initializeBrandSelection();

            // New code to update title and meta tags
            const reportTitle = this.report_question;
            document.title = reportTitle + " - AI Chat Watch";
            // Update meta tags
            document.querySelector('meta[name="description"]').setAttribute("content", reportTitle);
            document.querySelector('meta[property="og:title"]').setAttribute("content", reportTitle);
            document.querySelector('meta[property="og:description"]').setAttribute("content", reportTitle);


            /*
            if (this.GRAPH_BOT_categories_data && this.GRAPH_BOT_categories_data.length > 0) {
                this.enrichModelCategoriesArray();
                this.initModelCategoriesTable();
            }
            */

            // Log linkTypes status for debugging
            if (this.linkTypes === undefined || this.linkTypes === null) {
                console.warn('linkTypes property is undefined or null - this may indicate missing data in the enrichment process');
                // Don't initialize as empty array - let the filtering below handle missing data
            } else if (Array.isArray(this.linkTypes)) {
                console.log(`linkTypes array loaded with ${this.linkTypes.length} items`);
                if (this.linkTypes.length > 0) {
                    console.log('First linkType:', this.linkTypes[0]);
                }
            } else {
                console.warn('linkTypes exists but is not an array:', typeof this.linkTypes);
            }

            // now go through visual objects and mark objects with .sourceArrayName that are empty (zero items) in this array
            this.CURRENT_VISUAL_OBJECTS_ARRAY = this.CURRENT_VISUAL_OBJECTS_ARRAY.map(obj => {
                // checking if sourceArrayName is defined
                if (obj.sourceArrayName) {
                    // checking if sourceArrayName has items
                    if (this[obj.sourceArrayName]?.length > 0) {
                        return obj; // Keep as-is for non-empty sections
                    }
                    else {
                        console.debug(`marking visual object as empty: ${obj.title}, array name: ${obj.sourceArrayName}, zero items`);
                        // Instead of removing, mark as empty and change type
                        return {
                            ...obj,
                            isEmpty: true,
                            originalType: obj.type,
                            type: 'empty-section'
                        };
                    }
                }
                // skipping because this object is without sourceArrayName
                return obj;
            });


            // now we should put the object with the sourcearray from `mainSection` at the beginning of the array
            const mainSectionSourceArrayName = this.mainSection;
            // now we need to cut objects with sourceArrayName === mainSectionSourceArrayName from the array
            // and then add them at the beginning of the array before the first object with non-empty sourceArrayName
            if (mainSectionSourceArrayName && mainSectionSourceArrayName.length > 0) {
                // get all objects with sourceArrayName === mainSectionSourceArrayName
                const mainSectionObjects = this.CURRENT_VISUAL_OBJECTS_ARRAY.filter(obj => obj.sourceArrayName === mainSectionSourceArrayName);
                // sort mainSectionObjects by title A-Z
                mainSectionObjects.sort((a, b) => a.title.localeCompare(b.title));
                // now remove these objects from the array
                this.CURRENT_VISUAL_OBJECTS_ARRAY = this.CURRENT_VISUAL_OBJECTS_ARRAY.filter(obj => obj.sourceArrayName !== mainSectionSourceArrayName);

                // now re-assemble the mainSectionSourceArrayName objects by inserting tham before the first
                // object with non-empty sourceArrayName
                // find index of first object with non-empty sourceArrayName
                const firstNonEmptySourceArrayNameIndex = this.CURRENT_VISUAL_OBJECTS_ARRAY.findIndex(obj => obj.sourceArrayName && obj.sourceArrayName.length > 0);
                // now reassemble the array by inserting mainSectionObjects before the first object with non-empty sourceArrayName
                this.CURRENT_VISUAL_OBJECTS_ARRAY = [
                    ...this.CURRENT_VISUAL_OBJECTS_ARRAY.slice(0, firstNonEmptySourceArrayNameIndex),
                    ...mainSectionObjects,
                    ...this.CURRENT_VISUAL_OBJECTS_ARRAY.slice(firstNonEmptySourceArrayNameIndex)
                ];
            }
            // Remove consecutive duplicate ad banners, keeping only one
            this.CURRENT_VISUAL_OBJECTS_ARRAY = this.CURRENT_VISUAL_OBJECTS_ARRAY.reduce((acc, curr, i, arr) => {
                // Always keep non-ad components
                if (curr.type !== 'content-ad-banner') {
                    acc.push(curr);
                    return acc;
                }

                // For ad banners, only keep if previous component wasn't an ad
                const prev = arr[i - 1];
                if (!prev || prev.type !== 'content-ad-banner') {
                    acc.push(curr);
                }
                return acc;
            }, []);


            // initializing variables for tables and graphs
            this.CURRENT_VISUAL_OBJECTS_ARRAY.filter(obj => obj.type === 'table-with-items').forEach(obj => {
                // set to default to -1 as all shown
                this[`current_filtered_count_${obj.id}`] = -1;
                // intialize with default max visible items count
                this[`current_visible_items_count_${obj.id}`] = this.get_default_max_visible_item_count(this[`total_count_${obj.id}`]);
            });

            // Initialize filter counts for tabbed component nested configs
            this.CURRENT_VISUAL_OBJECTS_ARRAY.filter(obj => obj.type === 'tabbed-table-graph').forEach(obj => {
                if (obj.tableConfig) {
                    this[`current_filtered_count_${obj.tableConfig.id}`] = -1;
                    this[`current_visible_items_count_${obj.tableConfig.id}`] = this.get_default_max_visible_item_count(this[`total_count_${obj.tableConfig.id}`]);
                }
                if (obj.graphConfig) {
                    this[`current_filtered_count_${obj.graphConfig.id}`] = -1;
                }
            });

            // initializing total count for every source array mentioned in get_DEFAULT_VISUAL_OBJECTS_ARRAY()
            this.CURRENT_VISUAL_OBJECTS_ARRAY.forEach(obj => {
                if (obj.sourceArrayName && obj.sourceArrayName.length > 0 && this[obj.sourceArrayName]) {
                    this[`total_count_${obj.id}`] = this[obj.sourceArrayName].length;
                }
            });

            // Initialize total counts for tabbed component nested configs
            this.CURRENT_VISUAL_OBJECTS_ARRAY.filter(obj => obj.type === 'tabbed-table-graph').forEach(obj => {
                if (obj.tableConfig && obj.sourceArrayName && this[obj.sourceArrayName]) {
                    this[`total_count_${obj.tableConfig.id}`] = this[obj.sourceArrayName].length;
                }
                if (obj.graphConfig && obj.sourceArrayName && this[obj.sourceArrayName]) {
                    this[`total_count_${obj.graphConfig.id}`] = this[obj.sourceArrayName].length;
                }
            });

            // initializing variables for search filters
            this.CURRENT_VISUAL_OBJECTS_ARRAY.filter(obj => obj.hasSearchFilter).forEach(obj => {
                this[`${obj.id}_searchTerm`] = '';
            });

            // initializing variables for engine filters
            this.CURRENT_VISUAL_OBJECTS_ARRAY.filter(obj => obj.hasModelFilter).forEach(obj => {
                this[`selected_${obj.id}_AIModels`] = [];  // Changed to empty array for multi-select
            });


            // initializing variables for trends filters
            this.CURRENT_VISUAL_OBJECTS_ARRAY.filter(obj => obj.hasAppearanceOrderTrendFilter).forEach(obj => {
                this[`selected_${obj.id}_Trends`] = [];  // Changed to empty array for multi-select
            });

            // initializing variables for graphs
            this.CURRENT_VISUAL_OBJECTS_ARRAY.filter(obj => obj.type == 'graph-with-items').forEach(obj => {
                this[`simulation_${obj.id}`] = null;
            });



            // fill array of object ids for table of contents
            const tableOfContentsOptions = this.CURRENT_VISUAL_OBJECTS_ARRAY.filter(obj => obj?.tocPath && obj?.tocPath.length > 0).map(obj => ({
                id: obj.id,  // Don't add prefix here - it's added when creating the link
                path: obj.tocPath,
                sourceArrayName: obj.sourceArrayName,
                title: obj.title,
                type: obj.type  // Include type for icon display
            }));

            const tableOfContentsComponent = this.CURRENT_VISUAL_OBJECTS_ARRAY.find(obj => obj.type === 'about-report');

            // finally fill out list of options for ToC
            tableOfContentsComponent.options = tableOfContentsOptions;

            this.renderVisualObjects();

            this.setupEventListeners();
            this.updateShowMoreButtons();


            // Call initSortableTables after tables are initialized
            this.$nextTick(() => {
                this.initSortableTables();
            });

            this.$nextTick(() => {
                document.querySelectorAll('.selectable-text').forEach(el => {
                    if (!el.__vue_directive) {
                        // Create a new click handler directly instead of trying to use the directive
                        el.setAttribute('title', 'Click to select');

                        el.addEventListener('click', function (event) {
                            event.preventDefault();
                            event.stopPropagation();

                            const range = document.createRange();
                            range.selectNodeContents(this);
                            const selection = window.getSelection();
                            selection.removeAllRanges();
                            selection.addRange(range);
                        });

                        el.__vue_directive = true;
                    }
                });
            });


            if (this.isDarkMode) {
                document.documentElement.classList.add('dark');
            }

            this.$watch('isDarkMode', this.updateLabelColors);


            // Add resize event listener
            window.addEventListener('resize', this.handleResize);
            document.addEventListener('keydown', this.handleEscKey);

            setTimeout(() => {
                this.handleResize();
            }, 100);

            // adding event listeners for trend hints
            this.$nextTick(() => {
                if (!this.isTouchDevice) {
                    document.body.addEventListener('mouseover', (e) => {
                        if (e.target.classList.contains('has-data-hint')) {
                            this.showDataHint(e);
                        }
                    });

                    document.body.addEventListener('mouseout', (e) => {
                        if (e.target.classList.contains('has-data-hint')) {
                            this.removeDataHint(e);
                        }
                    });
                } else {
                    const handleTouchStart = (e) => {
                        if (e.target.classList.contains('has-data-hint')) {
                            e.preventDefault();
                            this.showDataHint(e);
                        }
                    };

                    document.body.addEventListener('touchstart', handleTouchStart, { passive: false });
                    document.body.addEventListener('click', handleTouchStart);
                }


            });

            // show modal

        },

        beforeDestroy() {
            // Existing cleanup
            window.removeEventListener('resize', this.handleResize);
            document.removeEventListener('keydown', this.handleEscKey);

            // Add cleanup for simulations
            this.CURRENT_VISUAL_OBJECTS_ARRAY.filter(obj => obj.type === 'graph-with-items').forEach(obj => {
                if (this[`simulation_${obj.id}`]) {
                    this[`simulation_${obj.id}`].stop();
                    this[`simulation_${obj.id}`] = null;
                }
            });

            // Add cleanup for charts
            if (this.charts) {
                Object.values(this.charts).forEach(chart => {
                    if (chart && typeof chart.destroy === 'function') {
                        chart.destroy();
                    }
                });
            }
        },

        updated() {
            // Reapply to any new elements that might have been added
            this.$nextTick(() => {
                document.querySelectorAll('.selectable-text').forEach(el => {
                    if (!el.__vue_directive) {
                        this.$options.directives.selectableText.bind(el);
                        el.__vue_directive = true;
                    }
                });
            });
        },

        computed: {

            // Combine all entities for brand selection
            getAllEntities() {
                const entities = [];

                // Add entities from each main array
                ENTITES_ALL.forEach(arrayName => {
                    const items = this[arrayName] || [];
                    items.forEach(item => {
                        if (item.value) {
                            entities.push({
                                ...item,
                                entityType: item.type,
                                entityTypeLabel: item.type,
                                display_name: `${item.value} (${item.type}) - ${item.mentions || 0} mentions`
                            });
                        }
                    });
                });

                // Sort by influence descending
                return entities.sort((a, b) => (b.influence || 0) - (a.influence || 0));
            },

            getVisualScalingFactorForGraph() {
                // return scaling based on window width
                return window.innerWidth < 768 ? GRAPH_SCALING_FACTOR_ON_MOBILE : 1;
            },

            isTouchDevice() {
                return 'ontouchstart' in window || (window.navigator.msMaxTouchPoints > 0);
            },

            getTrendColorClass() {
                return (trend) => {
                    const trendClasses = {
                        [TRENDS.UP]: 'text-green-500',
                        [TRENDS.DOWN]: 'text-red-500',
                        [TRENDS.STABLE]: 'text-gray-400',
                        [TRENDS.NEW]: 'text-green-300',
                        [TRENDS.DISAPPEARED]: 'text-gray-400',
                        [TRENDS.FLUCTUATING]: 'text-gray-400',
                        [TRENDS.UNKNOWN]: 'text-gray-400'
                    };
                    return trendClasses[trend] || 'text-gray-400'; // Added fallback
                };
            },

            ...get_DEFAULT_VISUAL_OBJECTS_ARRAY().filter(obj => obj.hasModelFilter).reduce((acc, obj) => ({
                ...acc,
                [`${obj.id}_bot_ids`]() {
                    // returns array of bot ids with their counts like [ {id: 'google_gemini', count: 12}, {id: 'brave_search', count: 13} ]
                    const modelCounts = this[obj.sourceArrayName]?.length > 0 && this.itemCountPerModel?.[obj.sourceArrayName]
                        ? this.itemCountPerModel[obj.sourceArrayName]
                        : [];

                    return modelCounts ? modelCounts.map(bot => {
                        // return as string. So we will have array of bot ids like ['google_gemini', 'brave_search']
                        return bot.id;
                    }) : [];
                }
            }), {}),

            ...get_DEFAULT_VISUAL_OBJECTS_ARRAY().filter(obj => obj.hasModelFilter).reduce((acc, obj) => ({
                ...acc,
                [`${obj.id}_bot_names_with_counts`]() {
                    // returns array of bot ids with their counts like [ {id: 'google_gemini', count: 12}, {id: 'brave_search', count: 13} ]
                    const modelCounts = this[obj.sourceArrayName]?.length > 0 && this.itemCountPerModel?.[obj.sourceArrayName]
                        ? this.itemCountPerModel[obj.sourceArrayName]
                        : [];

                    return modelCounts ? modelCounts.map(bot => {
                        // format every element as `Google Gemini [12]`, `Brave Search [13]` etc
                        // where every number is a count of items for this bot in this array
                        return `${this.getModelNameById(bot.id)} [${bot.count}]`;
                    }) : [];
                }
            }), {}),


            // filters by trends
            ...get_DEFAULT_VISUAL_OBJECTS_ARRAY().filter(obj => obj.hasAppearanceOrderTrendFilter).reduce((acc, obj) => ({
                ...acc,
                [`${obj.id}_appearanceOrder_trend_ids`]() {
                    // returns array of bot ids with their counts like [ {id: 'google_gemini', count: 12}, {id: 'brave_search', count: 13} ]
                    const trendCounts = this[obj.sourceArrayName]?.length > 0 && this.itemCountPerAppearanceOrderTrend?.[obj.sourceArrayName]
                        ? this.itemCountPerAppearanceOrderTrend[obj.sourceArrayName]
                        : [];

                    return trendCounts ? trendCounts.map(trend => {
                        // return as string. So we will have array of trend ids like ['google_gemini', 'brave_search']
                        return trend.id;
                    }) : [];
                }
            }), {}),

            ...get_DEFAULT_VISUAL_OBJECTS_ARRAY().filter(obj => obj.hasAppearanceOrderTrendFilter).reduce((acc, obj) => ({
                ...acc,
                [`${obj.id}_appearanceOrder_trend_names_with_counts`]() {
                    // returns array of bot ids with their counts like [ {id: 'google_gemini', count: 12}, {id: 'brave_search', count: 13} ]
                    const trendCounts = this[obj.sourceArrayName]?.length > 0 && this.itemCountPerAppearanceOrderTrend?.[obj.sourceArrayName]
                        ? this.itemCountPerAppearanceOrderTrend[obj.sourceArrayName]
                        : [];

                    return trendCounts ? trendCounts.map(trend => {
                        // format every element as `Google Gemini [12]`, `Brave Search [13]` etc
                        // where every number is a count of items for this trend in this array
                        return `${this.getTrendDescription(trend.id, false)} [${trend.count}]`;
                    }) : [];
                }
            }), {}),

            // creating properties with total item count per bot, like this: "<container_id>_item_count" containing count of items in this container
            ...get_DEFAULT_VISUAL_OBJECTS_ARRAY().filter(obj => (obj.sourceArrayName && obj.sourceArrayName.length > 0)).reduce((acc, obj) => ({
                ...acc,
                [`${obj.id}_item_count`]() {
                    return this[obj.sourceArrayName]?.length || 0;
                }
            }), {}),

            // creating properties with total item count
            //like this: "<container_id>_item_count[]" containing elements like
            // [{id: 'google_gemini', count: 12}, {id: 'brave', count: 13}]
            ...get_DEFAULT_VISUAL_OBJECTS_ARRAY().filter(obj => (obj.sourceArrayName && obj.sourceArrayName.length > 0)).reduce((acc, obj) => ({
                ...acc,
                [`${obj.id}_item_count_by_bot`]() {
                    return this[obj.sourceArrayName]?.length > 0 ? this.itemCountPerModel[obj.sourceArrayName] : [];
                }
            }), {}),

            ...get_DEFAULT_VISUAL_OBJECTS_ARRAY().filter(obj => (obj.sourceArrayName && obj.sourceArrayName.length > 0)).reduce((acc, obj) => ({
                ...acc,
                [`${obj.id}_item_count_by_trend`]() {
                    return this[obj.sourceArrayName]?.length > 0 ? this.itemCountPerAppearanceOrderTrend[obj.sourceArrayName] : [];
                }
            }), {}),

            // return filtered objects for given visual objects
            ...get_DEFAULT_VISUAL_OBJECTS_ARRAY().filter(obj => (obj.hasSearchFilter || obj.hasModelFilter || obj.hasAppearanceOrderTrendFilter)).reduce((acc, obj) => ({
                ...acc,
                [`filtered_${obj.id}`]() {
                    let filtered = null;

                    if (!this[obj.sourceArrayName] || this[obj.sourceArrayName].length === 0) {
                        return [];
                    }

                    // filter by search term if need to
                    if (obj.hasSearchFilter) {
                        // get search term
                        const searchTerm = this[`${obj.id}_searchTerm`].toLowerCase();

                        if (!searchTerm) {
                            // if search term is empty, return all items
                            filtered = this[obj.sourceArrayName];
                        } else {
                            // otherwise filter by search term
                            filtered = this[obj.sourceArrayName].filter(el => {
                                let result = false;
                                // Get the search fields from config
                                const searchFields = obj.searchFilterFields || [];

                                // go through all search fields
                                for (const field of searchFields) {
                                    // get value of current field
                                    let elValue = el[field];
                                    // Find the column config for this field
                                    const columnConfig = obj.columns?.find(col => col.type === field);
                                    if (columnConfig?.subType === 'botId') {
                                        // if it is botId, get bot name and convert to lowercase
                                        const modelName = this.getModelNameById(elValue);
                                        elValue = modelName ? modelName.toLowerCase() : '';
                                    }

                                    // check if search term is in this field value
                                    result = elValue && elValue.toLowerCase().includes(searchTerm);
                                    if (result) {
                                        // if yes, break the loop
                                        break;
                                    }
                                }
                                // return result of search
                                // if true then item will be included in filtered array
                                return result;
                            });

                        }
                    } else {
                        // if no search filter, just return all items
                        filtered = this[obj.sourceArrayName];
                    }

                    // additionally filter by AI engines if need to
                    if (obj.hasModelFilter) {
                        // filtered by selected AI engines too
                        filtered = this.filterBySelected_AIModels(
                            obj,
                            filtered,
                            this[`selected_${obj.id}_AIModels`]
                        );
                    }

                    // additionally filter by trends if need to
                    if (obj.hasAppearanceOrderTrendFilter) {
                        filtered = this.filterBySelected_appearanceOrder_Trends(
                            filtered,
                            this[`selected_${obj.id}_appearanceOrder_Trends`]
                        );
                    }

                    // additionally filter by prompt if this is an aggregate report
                    if (this.isAggregateReport) {
                        filtered = this.filterItemsByPrompt(filtered, this.selectedPromptFilter);
                    }

                    // sort in descending order
                    filtered = this.sortByGivenColumn(filtered, obj.defaultSortingColumn, obj.defaultSortingDirection);

                    // Apply top items limit for graphs
                    if (obj.type === 'graph-with-items') {
                        const limit = this[`${obj.id}_topItemsLimit`];
                        if (limit !== null && limit > 0) {
                            filtered = filtered.slice(0, limit);
                        }
                    }

                    // finally return filtered array
                    return filtered;
                }
            }), {}),


            botIds() {
                return this.bots.map(bot => bot.id);
            },

            processedActionPlatform() {
                if (!this.selectedAction) return [];
                const preprocessedText = this.preprocessActionPromptMacros(this.selectedAction.actionPlatform);
                if (IS_DEBUG) {
                    console.debug(`DEBUG: preprocessedText: ${preprocessedText}`);
                }
                return this.generateLinksFromText(preprocessedText);
            },

            totalModelWeight() {
                return this.bots.reduce((sum, bot) => sum + bot.weight, 0);
            },

            botWeights() {
                return new Map(this.bots.map(bot => [bot.id, bot.weight]));
            },

            stringToColor() {
                // HSL color space gives better control over similarity
                return function (input) {
                    // Generate consistent hue from string
                    let hue = 0;
                    for (let i = 0; i < input.length; i++) {
                        hue = ((hue << 5) - hue) + input.charCodeAt(i);
                        hue = hue & hue; // Convert to 32-bit integer
                    }
                    hue = Math.abs(hue) % 360; // Map to 0-360 degrees

                    // Use fixed saturation and lightness for consistency
                    const saturation = 70; // 70% saturation
                    const lightness = 45; // 45% lightness

                    // Convert HSL to hex color
                    const h = hue / 360;
                    const s = saturation / 100;
                    const l = lightness / 100;

                    const hue2rgb = (p, q, t) => {
                        if (t < 0) t += 1;
                        if (t > 1) t -= 1;
                        if (t < 1 / 6) return p + (q - p) * 6 * t;
                        if (t < 1 / 2) return q;
                        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                        return p;
                    };

                    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
                    const p = 2 * l - q;
                    const r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
                    const g = Math.round(hue2rgb(p, q, h) * 255);
                    const b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);

                    return `#${(1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1)}`;
                };
            },

        },
        methods: {

            // Debounce utility function to limit how often a function can be called
            debounce(func, delay) {
                let timeoutId;
                return function (...args) {
                    clearTimeout(timeoutId);
                    timeoutId = setTimeout(() => func.apply(this, args), delay);
                };
            },

            // Helper method for formatting dates in short format
            formatDateShort(dateStr) {
                if (!dateStr) return '';
                const date = new Date(dateStr);
                const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                return `${months[date.getMonth()]} ${date.getDate()}`;
            },

            renderVisualObjects() {
                this.CURRENT_VISUAL_OBJECTS_ARRAY.forEach(obj => {
                    if (obj.type === 'table-with-items') {
                        this.$nextTick(() => {
                            this.init_table(obj);
                        });
                    }
                    else if (obj.type === 'graph-with-items') {
                        this.$nextTick(() => {
                            this.init_graph(obj);
                        });
                    }
                    else if (obj.type === 'chart-with-items') {
                        this.$nextTick(() => {
                            this.init_chart(obj);
                        });
                    }
                    else if (obj.type === 'tabbed-table-graph') {
                        // For tabbed components, only initialize table - graph is lazy loaded
                        this.$nextTick(() => {
                            if (obj.tableConfig) {
                                this.init_table(obj.tableConfig);
                            }
                            // Graph will be initialized when user switches to graph tab
                        });
                    }
                    else {
                        // other types are not requiring init yet
                    }
                });
            },

            scrollToElement(elementId) {
                console.debug('scrollToElement called with ID:', elementId);
                const element = document.getElementById(elementId);

                if (element) {
                    // Try to find the h2 title within the section for precise scrolling
                    const titleElement = element.querySelector('h2.text-xl.font-semibold');
                    const targetElement = titleElement || element;

                    // Use smaller offset for precise h2 targeting, larger offset for fallback
                    const offset = titleElement ? 80 : 160;
                    const offsetPosition = targetElement.offsetTop - offset;

                    console.debug('Scrolling to:', titleElement ? 'section title' : 'section container', 'at position:', offsetPosition);

                    window.scrollTo({
                        top: offsetPosition,
                        behavior: 'smooth'
                    });

                    // Add a brief highlight effect to show which section was navigated to
                    element.classList.add('highlight-section');
                    setTimeout(() => {
                        element.classList.remove('highlight-section');
                    }, 2000);
                } else {
                    console.warn('Element not found with ID:', elementId);
                }
            },

            // Clean AI-generated summary text by removing HTML artifacts and replacing model IDs
            cleanAISummary(summary) {
                if (!summary) return summary;

                // Create model ID to display name mapping from bots array
                const modelMap = new Map();
                for (const bot of this.bots || []) {
                    modelMap.set(bot.id, bot.name);
                }

                let cleaned = summary;

                // Replace model IDs with display names using simple string replacement
                // Sort by length descending to replace longer IDs first (avoid partial replacements)
                const sortedModelIds = Array.from(modelMap.keys()).sort((a, b) => b.length - a.length);
                for (const modelId of sortedModelIds) {
                    const display_name = modelMap.get(modelId);
                    // Simple word boundary replacement - works for both text and HTML
                    const regex = new RegExp(`\\b${this.escapeRegExp(modelId)}\\b`, 'g');
                    cleaned = cleaned.replace(regex, display_name);
                }

                // Clean up excessive whitespace while preserving intentional line breaks
                cleaned = cleaned.replace(/[ \t]+/g, ' '); // Replace multiple spaces/tabs with single space
                cleaned = cleaned.replace(/\n\s*\n\s*\n/g, '\n\n'); // Max 2 consecutive line breaks
                cleaned = cleaned.trim();

                return cleaned;
            },

            // Process summary text to make entity mentions clickable
            // Uses HTML-aware processing to avoid breaking HTML structure
            processTextForClickableEntities(text) {
                if (!text) return text;

                // Build searchable entity index from all data arrays
                const entityIndex = this.buildEntityIndex();

                if (Object.keys(entityIndex).length === 0) {
                    return text; // No entities to process
                }

                // Use DOMParser to parse HTML properly
                const parser = new DOMParser();
                const doc = parser.parseFromString(text, 'text/html');

                // Check if parsing failed
                if (!doc.body) {
                    console.warn('Failed to parse HTML for entity processing');
                    return text;
                }

                // Sort entities by length (longest first) to avoid partial replacements
                const sortedEntities = Object.keys(entityIndex).sort((a, b) => b.length - a.length);

                // Walk through text nodes only
                const walk = (node) => {
                    if (node.nodeType === Node.TEXT_NODE) {
                        let textContent = node.textContent;
                        let modified = false;

                        // Try to replace each entity in this text node
                        // Since entities are sorted longest-first, we use the first match and stop
                        // to avoid matching shorter entities that are substrings
                        for (const entityKey of sortedEntities) {
                            const entityInfo = entityIndex[entityKey];
                            const regex = new RegExp(`\\b(${this.escapeRegExp(entityInfo.originalValue)})\\b`, 'gi');

                            if (regex.test(textContent)) {
                                textContent = textContent.replace(regex, (match) => {
                                    modified = true;
                                    return `<span class="clickable-entity" data-entity-type="${entityInfo.type}" data-entity-value="${entityInfo.value}" title="Click to view ${entityInfo.originalValue} in ${entityInfo.type} section">${match}</span>`;
                                });
                                break; // Stop after first match to prevent overlapping replacements
                            }
                        }

                        // If we modified the text, replace the text node with parsed HTML
                        if (modified) {
                            // Use DocumentFragment for cleaner insertion
                            const fragment = document.createRange().createContextualFragment(textContent);
                            node.parentNode.replaceChild(fragment, node);
                        }
                    } else if (node.nodeType === Node.ELEMENT_NODE) {
                        // Skip certain elements where we don't want to make entities clickable
                        const skipElements = ['CODE', 'PRE', 'SCRIPT', 'STYLE', 'A'];
                        if (skipElements.includes(node.tagName)) {
                            return; // Skip this element and its children
                        }

                        // Process child nodes
                        // Convert to array to avoid issues with live NodeList during modifications
                        Array.from(node.childNodes).forEach(child => walk(child));
                    }
                };

                // Start walking from body
                walk(doc.body);

                // Return the processed HTML
                return doc.body.innerHTML;
            },

            // Build searchable index of all entities across all data arrays
            buildEntityIndex() {
                const index = {};
                const entityTypes = ENTITES_ALL;

                for (const type of entityTypes) {
                    if (this[type] && Array.isArray(this[type])) {
                        for (const item of this[type]) {
                            const value = item.value || item.name || item.code || '';
                            if (value && value.length > 2) { // Only index meaningful strings
                                const normalizedValue = value.toLowerCase().trim();
                                // Avoid duplicates and give priority to longer matches
                                if (!index[normalizedValue] || index[normalizedValue].originalValue.length < value.length) {
                                    index[normalizedValue] = {
                                        type: type === 'linkTypes' ? 'linkType' : type.replace(/s$/, ''), // Singular for data attributes
                                        value: normalizedValue,
                                        originalValue: value.trim()
                                    };
                                }
                            }
                        }
                    }
                }

                return index;
            },

            // Navigate to entity section and highlight the specific item
            navigateToEntity(entityType, entityValue) {
                console.debug('Navigating to entity:', entityType, entityValue);

                // Map entity type to section ID using existing map
                const sectionId = getEntityTableSectionId(entityType);

                // First scroll to the section
                this.scrollToElement(sectionId);

                // Wait for scroll animation, then highlight the specific row
                setTimeout(() => {
                    this.highlightEntityRow(entityType, entityValue);
                }, 800); // Delay to allow smooth scroll to complete
            },

            // Highlight specific entity row in table
            highlightEntityRow(entityType, entityValue) {
                const pluralType = entityType === 'linkType' ? 'linkTypes' : entityType + 's';
                const tableId = `table_${pluralType}`;
                const table = document.getElementById(tableId);

                if (table) {
                    // Find the row with matching data attributes
                    const targetRow = table.querySelector(`tr[data-entity-type="${entityType}"][data-entity-value="${entityValue.toLowerCase().trim()}"]`);

                    if (targetRow) {
                        // Add slow flash animation
                        targetRow.classList.add('entity-row-flash');
                        targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });

                        // Remove flash class after animation completes
                        setTimeout(() => {
                            targetRow.classList.remove('entity-row-flash');
                        }, 3100);
                    } else {
                        console.warn('Entity row not found:', entityType, entityValue);
                    }
                } else {
                    console.warn('Table not found:', tableId);
                }
            },

            // Escape special regex characters
            escapeRegExp(string) {
                return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            },

            showExcerptPopup(item, highlightField = 'value') {
                // Determine if value is a link?
                const isLink = item[highlightField].toLowerCase().match(/http|www/);                
                const searchTerm = isLink ? this.cleanAndMinimizeUrl(item[highlightField].toLowerCase()) : item[highlightField];
                if (!searchTerm || searchTerm.length === 0) {
                    console.error(`No search term found for item ${highlightField}, item: ${JSON.stringify(item)}`);
                    return;
                }

                // Create or update the excerpt popup
                let popup = document.getElementById('excerpt-popup');
                if (!popup) {
                    popup = document.createElement('div');
                    popup.id = 'excerpt-popup';
                    popup.className = 'fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 z-50 flex items-center justify-center p-4';
                    popup.style.display = 'none';
                    document.body.appendChild(popup);
                }

                // Build the popup content
                const excerptsByModel = item.excerptsByModel || {};
                const hasExcerpts = Object.keys(excerptsByModel).some(modelId => excerptsByModel[modelId] && excerptsByModel[modelId].length > 0);

                if (!hasExcerpts) {
                    console.warn('No excerpts available for item:', item);
                    return;
                }

                // Determine the category of this item and gather related items
                const currentData = window[this.selectedVersion] || window.AppData;
                let itemCategory = '';
                let relatedItems = [];

                if (currentData) {
                    // Find which category this item belongs to
                    const categories = ENTITES_NON_COMPUTED;
                    for (const category of categories) {
                        if (currentData[category] && Array.isArray(currentData[category])) {
                            const found = currentData[category].find(x =>
                                (x.value || '').toLowerCase() === (item.value || '').toLowerCase()
                            );
                            if (found) {
                                itemCategory = category;
                                // Get all other items from the same category (excluding current item)
                                relatedItems = currentData[category]
                                    .filter(x => (x.value || '').toLowerCase() !== (item.value || '').toLowerCase())
                                    .map(x => x.value || '')
                                    .filter(x => x.length > 0);
                                break;
                            }
                        }
                    }
                }

                // Create popup content
                // Sort models by mention count (descending) and filter out models with no valid excerpts
                const sortedModels = Object.entries(excerptsByModel)
                    .filter(([modelId, excerpts]) => {
                        if (!excerpts || excerpts.length === 0) return false;
                        // Check if at least one excerpt actually contains the search term
                        const searchRegex = new RegExp(this.escapeRegExp(searchTerm), 'gi');
                        return excerpts.some(exc => searchRegex.test(exc.excerpt || ''));
                    })
                    .sort(([modelIdA, excerptsA], [modelIdB, excerptsB]) => {
                        const mentionsA = item.mentionsByModel && item.mentionsByModel[modelIdA] ? item.mentionsByModel[modelIdA] : 0;
                        const mentionsB = item.mentionsByModel && item.mentionsByModel[modelIdB] ? item.mentionsByModel[modelIdB] : 0;
                        return mentionsB - mentionsA;
                    });

                // If no models have valid excerpts, don't show popup
                if (sortedModels.length === 0) {
                    console.warn(`No valid excerpts were found for item ${item[highlightField]}, item: ${JSON.stringify(item)}`);
                    return;
                }

                // Generate unique ID for this popup instance
                const popupInstanceId = 'popup-' + Date.now();

                let content = `
                    <div class="bg-white dark:bg-gray-800 rounded-lg max-w-5xl w-full max-h-[85vh] flex flex-col relative">
                        <button onclick="document.getElementById('excerpt-popup').style.display='none'" 
                                class="absolute top-4 right-4 z-10 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 bg-white dark:bg-gray-800 rounded-full p-2 shadow-md hover:shadow-lg transition-all duration-200"
                                title="Close (ESC)">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                        <div class="p-6 pb-0 flex-shrink-0">
                            <h3 class="text-xl font-semibold mb-2">Showing excerpts for: <mark class="bg-yellow-200 dark:bg-yellow-600 px-1 rounded">${this.escapeHtml(searchTerm || '')}</mark></h3>
                            ${this.selectedVersion && window[this.selectedVersion] && window[this.selectedVersion].report_question ? `
                                <div class="text-sm text-gray-600 dark:text-gray-400 mb-4">
                                    Question: <span class="font-medium">${this.escapeHtml(window[this.selectedVersion].report_question)}</span>
                                </div>
                            ` : ''}
                        </div>
                        
                        <div class="px-6 flex-shrink-0">
                            <div class="border-b border-gray-200 dark:border-gray-700">
                                <nav class="-mb-px flex gap-8 overflow-x-auto" aria-label="Tabs">
                                    ${sortedModels.map(([modelId, excerpts], index) => {
                    const modelName = this.getModelNameById(modelId);
                    const mentions = item.mentionsByModel && item.mentionsByModel[modelId] ? item.mentionsByModel[modelId] : 0;
                    const appearanceOrder = item.appearanceOrderByModel && item.appearanceOrderByModel[modelId] ? item.appearanceOrderByModel[modelId] : null;

                    return `
                                            <button
                                                onclick="window.app.switchExcerptTab('${popupInstanceId}', '${modelId}')"
                                                data-tab-id="${modelId}"
                                                class="tab-button ${index === 0 ? 'active' : ''} whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm transition-colors ${index === 0
                            ? 'border-indigo-500 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                        }"
                                            >
                                                <div class="flex items-center gap-2">
                                                    <img src="${this.getModelIconUrl(modelId)}" class="w-4 h-4" alt="${modelName}" onerror="this.style.display='none'">
                                                    <span>${modelName}</span>
                                                    ${mentions > 0 ? `<span class="text-xs text-gray-500 dark:text-gray-400">(${mentions})</span>` : ''}
                                                </div>
                                            </button>
                                        `;
                }).join('')}
                                </nav>
                            </div>
                        </div>
                        
                        <div class="p-6 pt-4 flex-1 overflow-y-auto">
                            <div id="${popupInstanceId}-tab-content">
                `;

                // Add excerpts for each model as tab panels
                sortedModels.forEach(([modelId, excerpts], modelIndex) => {
                    if (excerpts && excerpts.length > 0) {
                        const modelName = this.getModelNameById(modelId);

                        // Get appearanceOrder and mentions for this model
                        const appearanceOrder = item.appearanceOrderByModel && item.appearanceOrderByModel[modelId] ? item.appearanceOrderByModel[modelId] : null;
                        const mentions = item.mentionsByModel && item.mentionsByModel[modelId] ? item.mentionsByModel[modelId] : 0;

                        content += `
                            <div id="${popupInstanceId}-panel-${modelId}" class="tab-panel ${modelIndex === 0 ? '' : 'hidden'}">
                                <div class="space-y-3">
                        `;

                        // Group excerpts by question (for aggregate reports) and filter out false positives
                        const excerptsByQuestion = {};
                        excerpts.forEach(excerpt => {
                            // Check if the excerpt actually contains the search term
                            const searchRegex = new RegExp(this.escapeRegExp(searchTerm), 'gi');
                            if (searchRegex.test(excerpt.excerpt || '')) {
                                const questionKey = excerpt.question || 'default';
                                if (!excerptsByQuestion[questionKey]) {
                                    excerptsByQuestion[questionKey] = [];
                                }
                                excerptsByQuestion[questionKey].push(excerpt);
                            }
                        });

                        // Skip this model entirely if no valid excerpts found
                        if (Object.keys(excerptsByQuestion).length === 0) {
                            return; // Skip to next model
                        }

                        // Display excerpts grouped by question
                        Object.entries(excerptsByQuestion).forEach(([questionKey, questionExcerpts], questionIndex) => {
                            const question = questionKey === 'default' ? null : questionKey;
                            const excerptGroupId = `${popupInstanceId}-${modelId}-${questionIndex}`;

                            content += `
                                <div class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                            `;

                            // Show question header if available
                            if (question) {
                                // Extract question number from the first excerpt's promptId if available
                                let questionNumber = '';
                                if (questionExcerpts.length > 0 && questionExcerpts[0].promptId) {
                                    const match = questionExcerpts[0].promptId.match(/^(\d+)-/);
                                    if (match) {
                                        questionNumber = `${match[1]}. `;
                                    }
                                }

                                content += `
                                    <div class="bg-gray-50 dark:bg-gray-900 px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                                        <div class="text-sm font-medium text-gray-700 dark:text-gray-300">${questionNumber}${this.escapeHtml(question)}</div>
                                    </div>
                                `;
                            }

                            content += `
                                <div class="p-4">
                                    <div class="space-y-2">
                            `;

                            // Filter excerpts to only include those that actually contain the term
                            const validExcerpts = questionExcerpts.filter(exc => {
                                // Check if the excerpt actually contains the search term
                                const searchRegex = new RegExp(this.escapeRegExp(searchTerm), 'gi');
                                return searchRegex.test(exc.excerpt || '');
                            });

                            // Show only the first valid excerpt with count of actual occurrences
                            if (validExcerpts.length > 0) {
                                const excerpt = validExcerpts[0]; // Only use the first valid excerpt

                                // Count actual occurrences in the full answer if available
                                let occurrenceCount = 0;
                                let countFound = false;

                                if (window.fullAnswers && excerpt.promptId) {
                                    // Get the current date from the data
                                    const date = this.report_date || (this.totalDates && this.totalDates[this.totalDates.length - 1]);
                                    // Navigate the structure: fullAnswers[questionId][date][modelId]
                                    const fullAnswerData = window.fullAnswers?.[excerpt.promptId]?.[date]?.[modelId];
                                    if (fullAnswerData) {
                                        // Handle both old format (string) and new format (object with text/html)
                                        const fullAnswerText = typeof fullAnswerData === 'string'
                                            ? fullAnswerData
                                            : fullAnswerData.text || '';

                                        if (fullAnswerText) {
                                            // Create a case-insensitive regex to count occurrences
                                            const searchRegex = new RegExp(this.escapeRegExp(searchTerm), 'gi');
                                            const matches = fullAnswerText.match(searchRegex);
                                            occurrenceCount = matches ? matches.length : 0;
                                            countFound = true;
                                        }
                                    }
                                }

                                // Show actual count if we found it, otherwise fallback to excerpt count
                                let additionalCount = '';
                                if (countFound && occurrenceCount > 1) {
                                    additionalCount = ` + ${occurrenceCount - 1} more)`;
                                } else if (!countFound && questionExcerpts.length > 1) {
                                    // Fallback for older reports without full answers
                                    additionalCount = ` (${questionExcerpts.length} excerpts)`;
                                }

                                // First highlight the main item with related terms
                                let highlightedExcerpt = this.highlightWithRelatedTerms(excerpt.excerpt, searchTerm, relatedItems);

                                // Then highlight all selected brands (including the main item if it's a brand)
                                this.selectedItems.forEach(brand => {
                                    if (brand.value) {
                                        // Use a separate function to highlight brands with the brand-highlight class
                                        highlightedExcerpt = this.highlightBrandInExcerpt(highlightedExcerpt, brand.value);
                                    }
                                });

                                const dateInfo = excerpt.captureDate ?
                                    `${this.formatDateShort(excerpt.captureDate)} at ` : '';
                                const lineColInfo = excerpt.line && excerpt.column ?
                                    `<span class="text-gray-400 text-xs font-mono">[${dateInfo}Ln ${excerpt.line}, Col ${excerpt.column}${additionalCount}]</span> ` : '';

                                const excerptId = `${excerptGroupId}-excerpt-0`;

                                // Check if HTML rendering is available for this answer
                                let hasHtmlRendering = false;
                                if (window.fullAnswers && excerpt.promptId) {
                                    const date = this.report_date || (this.totalDates && this.totalDates[this.totalDates.length - 1]);
                                    const fullAnswerData = window.fullAnswers?.[excerpt.promptId]?.[date]?.[modelId];
                                    if (fullAnswerData && typeof fullAnswerData === 'object' && fullAnswerData.html) {
                                        hasHtmlRendering = true;
                                    }
                                }

                                // Create the toggle button HTML only if HTML rendering is available
                                const toggleButtonHtml = hasHtmlRendering ? `
                                    <button onclick="window.app.toggleAnswerViewMode('${excerptId}')"
                                            class="markdown-toggle-btn text-xs text-green-600 hover:text-green-500 dark:text-green-400 dark:hover:text-green-300">
                                        View Raw Markdown
                                    </button>
                                ` : '';

                                content += `
                                    <div>
                                        <div id="${excerptId}" class="text-sm transition-all duration-300">
                                            <div class="excerpt-collapsed">
                                                <div class="flex items-start justify-between gap-2">
                                                    <div class="flex-1">
                                                        ${lineColInfo}
                                                        <span class="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded px-1 -mx-1 transition-colors"
                                                              onclick="window.app.toggleInlineFullAnswer('${excerptId}', '${modelId}', '${excerpt.promptId || ''}')"
                                                              title="Click to expand full answer">
                                                            ${highlightedExcerpt}
                                                        </span>
                                                    </div>
                                                    <button onclick="window.app.toggleInlineFullAnswer('${excerptId}', '${modelId}', '${excerpt.promptId || ''}')"
                                                            class="text-xs text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300 flex-shrink-0">
                                                        Expand
                                                    </button>
                                                </div>
                                            </div>
                                            <div class="excerpt-expanded hidden">
                                                <div class="mb-2 flex items-center justify-between">
                                                    <div>${lineColInfo}</div>
                                                    <div class="flex gap-2">
                                                        ${toggleButtonHtml}
                                                        <button onclick="window.app.toggleInlineFullAnswer('${excerptId}', '${modelId}', '${excerpt.promptId || ''}')"
                                                                class="text-xs text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300">
                                                            Collapse
                                                        </button>
                                                    </div>
                                                </div>
                                                <div class="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 max-h-96 overflow-y-auto excerpt-full-text">
                                                    <!-- Content will be injected here -->
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                `;
                            }

                            content += `
                                    </div>
                                </div>
                            </div>
                            `;
                        });

                        content += `
                                </div>
                            </div>
                        `;
                    }
                });

                content += `
                            </div>
                        </div>
                    </div>
                `;

                popup.innerHTML = content;
                popup.style.display = 'flex';

                // Close on background click
                popup.onclick = function (e) {
                    if (e.target === popup) {
                        popup.style.display = 'none';
                    }
                };

                // Close on ESC key
                const closeOnEscape = function (e) {
                    if (e.key === 'Escape' && popup.style.display !== 'none') {
                        popup.style.display = 'none';
                        document.removeEventListener('keydown', closeOnEscape);
                    }
                };
                document.addEventListener('keydown', closeOnEscape);

                // Store the popup instance ID for tab switching and related items for highlighting
                popup.dataset.instanceId = popupInstanceId;
                popup.dataset.relatedItems = JSON.stringify(relatedItems);
                popup.dataset.itemCategory = itemCategory;
                popup.dataset.currentItem = item.value || '';
            },

            switchExcerptTab(popupInstanceId, modelId) {
                // Get all tab buttons and panels for this popup instance
                const popup = document.getElementById('excerpt-popup');
                const tabButtons = popup.querySelectorAll('.tab-button');
                const tabPanels = popup.querySelectorAll('.tab-panel');

                // Update tab buttons
                tabButtons.forEach(button => {
                    if (button.dataset.tabId === modelId) {
                        button.classList.remove('border-transparent', 'text-gray-500', 'hover:text-gray-700', 'hover:border-gray-300', 'dark:text-gray-400', 'dark:hover:text-gray-300');
                        button.classList.add('border-indigo-500', 'text-indigo-600', 'dark:border-indigo-400', 'dark:text-indigo-400');
                    } else {
                        button.classList.remove('border-indigo-500', 'text-indigo-600', 'dark:border-indigo-400', 'dark:text-indigo-400');
                        button.classList.add('border-transparent', 'text-gray-500', 'hover:text-gray-700', 'hover:border-gray-300', 'dark:text-gray-400', 'dark:hover:text-gray-300');
                    }
                });

                // Update tab panels
                tabPanels.forEach(panel => {
                    if (panel.id === `${popupInstanceId}-panel-${modelId}`) {
                        panel.classList.remove('hidden');
                    } else {
                        panel.classList.add('hidden');
                    }
                });
            },

            toggleInlineFullAnswer(excerptId, modelId, promptId) {
                const excerptDiv = document.getElementById(excerptId);
                if (!excerptDiv) return;

                const collapsedDiv = excerptDiv.querySelector('.excerpt-collapsed');
                const expandedDiv = excerptDiv.querySelector('.excerpt-expanded');
                const fullTextContainer = excerptDiv.querySelector('.excerpt-full-text');

                if (!collapsedDiv || !expandedDiv || !fullTextContainer) return;

                // Get full answers from global data
                if (!window.fullAnswers) {
                    console.error('Full answers data not loaded. The answers.js file may be missing or failed to load.');
                    alert('Unable to load full answer. Please ensure the report was generated with the latest version.');
                    return;
                }

                // Get the current data
                let currentData = window[this.selectedVersion];

                // For aggregate reports, try alternative data sources
                if (!currentData) {
                    // Try to find any data object that starts with AppDataAggregate
                    const aggregateKeys = Object.keys(window).filter(key => key.startsWith('AppDataAggregate'));
                    if (aggregateKeys.length > 0) {
                        currentData = window[aggregateKeys[0]];
                    }
                }

                // If still no data, try window.AppData
                if (!currentData && window.AppData) {
                    currentData = window.AppData;
                }

                if (!currentData || !currentData.report_date) {
                    console.error('Missing date in current data. Available data:', {
                        selectedVersion: this.selectedVersion,
                        hasAppData: !!window.AppData,
                        windowKeys: Object.keys(window).filter(k => k.includes('App'))
                    });
                    return;
                }

                const date = currentData.report_date;
                let questionId;

                // For aggregate reports, use the promptId passed in
                // For single question reports, use the report_question_id
                if (currentData.report_type === 'aggregate' && promptId) {
                    questionId = promptId;
                } else {
                    questionId = currentData.report_question_id;
                }

                // Fallback: try to extract question ID from URL path for backward compatibility
                //if (!questionId && currentData.reportMetadata?.isQuestionReport) {
                if (!questionId) {
                    // Extract from URL path like: /reports/projects/ProjectName/2025-01-01/2-how-can-ai-help-with/index.html
                    const pathParts = window.location.pathname.split('/');
                    // Find the directory name that looks like a question ID (contains dash after number)
                    for (let i = pathParts.length - 2; i >= 0; i--) {
                        if (pathParts[i] && /^\d+-/.test(pathParts[i])) {
                            questionId = pathParts[i];
                            console.log('Extracted question ID from URL:', questionId);
                            break;
                        }
                    }
                }

                if (!questionId) {
                    console.warn('Unable to determine question ID');
                    return;
                }

                // Navigate the structure: fullAnswers[questionId][date][modelId]
                const fullAnswerData = window.fullAnswers?.[questionId]?.[date]?.[modelId];

                if (!fullAnswerData) {
                    console.warn(`No full answer available for question: ${questionId}, date: ${date}, model: ${modelId}`);
                    return;
                }

                // Handle both old format (string) and new format (object with text/html)
                let fullAnswerText, fullAnswerHtml;
                if (typeof fullAnswerData === 'string') {
                    // Old format - just raw markdown text
                    fullAnswerText = fullAnswerData;
                    fullAnswerHtml = null;
                } else {
                    // New format with both text and html
                    fullAnswerText = fullAnswerData.text;
                    fullAnswerHtml = fullAnswerData.html;
                }

                // Toggle visibility
                if (expandedDiv.classList.contains('hidden')) {
                    // Before expanding, collapse all other expanded answers
                    const popup = document.getElementById('excerpt-popup');
                    if (popup) {
                        // Find all expanded excerpts and collapse them
                        const allExpandedExcerpts = popup.querySelectorAll('.excerpt-expanded:not(.hidden)');
                        allExpandedExcerpts.forEach(expanded => {
                            const parent = expanded.closest('[id^="popup-"]');
                            if (parent && parent.id !== excerptId) {
                                expanded.classList.add('hidden');
                                const collapsed = parent.querySelector('.excerpt-collapsed');
                                if (collapsed) {
                                    collapsed.classList.remove('hidden');
                                }
                            }
                        });
                    }

                    // Expanding
                    collapsedDiv.classList.add('hidden');
                    expandedDiv.classList.remove('hidden');

                    // Get the term and related items to highlight from the popup data
                    const mainTerm = popup?.dataset.currentItem || '';
                    const relatedItemsData = popup?.dataset.relatedItems;
                    let relatedItems = [];

                    try {
                        relatedItems = relatedItemsData ? JSON.parse(relatedItemsData) : [];
                    } catch (e) {
                        console.warn('Failed to parse related items data');
                    }

                    // Always default to rendered view (don't store preference)
                    const storedViewMode = 'rendered';
                    const shouldShowRaw = storedViewMode === 'raw' || !fullAnswerHtml;

                    // Get the toggle button to update its text
                    const toggleBtn = excerptDiv.querySelector('.markdown-toggle-btn');

                    // Set the initial content based on view mode and availability
                    if (shouldShowRaw || !fullAnswerHtml) {
                        // Show raw markdown
                        fullTextContainer.classList.add('markdown-raw');
                        fullTextContainer.classList.remove('markdown-rendered');
                        if (mainTerm) {
                            fullTextContainer.innerHTML = `<pre class="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono">${this.highlightWithRelatedTerms(fullAnswerText, mainTerm, relatedItems)}</pre>`;
                        } else {
                            fullTextContainer.innerHTML = `<pre class="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono">${this.escapeHtml(fullAnswerText)}</pre>`;
                        }

                        // Update toggle button text (button might not exist for old reports)
                        if (toggleBtn && fullAnswerHtml) {
                            toggleBtn.textContent = 'View Formatted';
                            toggleBtn.style.display = 'inline-block';
                        } else if (toggleBtn) {
                            toggleBtn.style.display = 'none';
                        }
                    } else {
                        // Show rendered HTML
                        fullTextContainer.classList.add('markdown-rendered');
                        fullTextContainer.classList.remove('markdown-raw');
                        if (mainTerm) {
                            fullTextContainer.innerHTML = `<div class="markdown-content">${this.highlightHtmlWithTerms(fullAnswerHtml, mainTerm, relatedItems)}</div>`;
                        } else {
                            fullTextContainer.innerHTML = `<div class="markdown-content">${fullAnswerHtml}</div>`;
                        }

                        // Update toggle button text
                        if (toggleBtn) {
                            toggleBtn.textContent = 'View Raw Markdown';
                            toggleBtn.style.display = 'inline-block';
                        }
                    }

                    // Store the answer data in the container for toggle functionality
                    fullTextContainer.dataset.answerText = fullAnswerText;
                    fullTextContainer.dataset.answerHtml = fullAnswerHtml || '';
                    fullTextContainer.dataset.mainTerm = mainTerm;
                    fullTextContainer.dataset.relatedItems = JSON.stringify(relatedItems);

                    // Smooth scroll to make sure the expanded content is visible
                    setTimeout(() => {
                        excerptDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }, 100);
                } else {
                    // Collapsing
                    expandedDiv.classList.add('hidden');
                    collapsedDiv.classList.remove('hidden');
                }
            },

            highlightTermInExcerpt(excerpt, term) {
                if (!term) return this.escapeHtml(excerpt);

                const escapedExcerpt = this.escapeHtml(excerpt);
                const escapedTerm = this.escapeHtml(term);

                // Create a regex to find the term with word boundaries (case insensitive)
                const regex = new RegExp(`\\b(${escapedTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b`, 'gi');

                // Replace with highlighted version
                return escapedExcerpt.replace(regex, '<mark class="bg-yellow-200 dark:bg-yellow-600 px-1 rounded">$1</mark>');
            },

            highlightWithRelatedTerms(text, mainTerm, relatedTerms = []) {
                if (!mainTerm) return this.escapeHtml(text);

                let result = this.escapeHtml(text);

                // Create a temporary placeholder for the main term to protect it during related term highlighting
                const mainTermPlaceholder = `___MAIN_TERM_${Date.now()}___`;

                // FIRST: Replace main term with placeholder (WITH WORD BOUNDARIES)
                const escapedMainTerm = this.escapeHtml(mainTerm);
                // Create regex with word boundaries to avoid partial matches
                const mainRegex = new RegExp(`\\b(${escapedMainTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b`, 'gi');
                const mainTermMatches = [];
                result = result.replace(mainRegex, (match) => {
                    mainTermMatches.push(match);
                    return `${mainTermPlaceholder}${mainTermMatches.length - 1}${mainTermPlaceholder}`;
                });

                // SECOND: Highlight related terms with bold (now safe from interfering with main term)
                if (relatedTerms && relatedTerms.length > 0) {
                    // Filter out related terms that are substrings of the main term to avoid conflicts
                    const filteredRelated = relatedTerms.filter(relatedTerm => {
                        if (!relatedTerm || relatedTerm.length <= 2) return false;
                        // Don't highlight if the related term is a substring of the main term
                        if (mainTerm.toLowerCase().includes(relatedTerm.toLowerCase())) return false;
                        // Don't highlight if the main term is a substring of the related term
                        if (relatedTerm.toLowerCase().includes(mainTerm.toLowerCase())) return false;
                        return true;
                    });

                    // Sort by length descending to handle longer terms first
                    const sortedRelated = filteredRelated.sort((a, b) => b.length - a.length);

                    for (const relatedTerm of sortedRelated) {
                        const escapedRelated = this.escapeHtml(relatedTerm);
                        const relatedRegex = new RegExp(`\\b(${escapedRelated.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b`, 'gi');
                        result = result.replace(relatedRegex, '<strong>$1</strong>');
                    }
                }

                // FINALLY: Replace placeholders with highlighted main terms
                const placeholderRegex = new RegExp(`${mainTermPlaceholder}(\\d+)${mainTermPlaceholder}`, 'g');
                result = result.replace(placeholderRegex, (match, index) => {
                    const originalMatch = mainTermMatches[parseInt(index)];
                    return `<mark class="bg-yellow-200 dark:bg-yellow-600 px-1 rounded">${originalMatch}</mark>`;
                });

                return result;
            },

            escapeHtml(text) {
                const div = document.createElement('div');
                div.textContent = text;
                return div.innerHTML;
            },

            escapeRegExp(string) {
                return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            },

            // New function to highlight terms in HTML content
            highlightHtmlWithTerms(html, mainTerm, relatedTerms = []) {
                if (!mainTerm) return html;

                // Parse HTML and process text nodes only
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = html;

                const processTextNode = (node) => {
                    if (node.nodeType === Node.TEXT_NODE) {
                        let text = node.textContent;

                        // Highlight main term
                        const mainRegex = new RegExp(`\\b(${this.escapeRegExp(mainTerm)})\\b`, 'gi');
                        text = text.replace(mainRegex, '<mark class="bg-yellow-200 dark:bg-yellow-600 px-1 rounded">$1</mark>');

                        // Highlight related terms
                        if (relatedTerms && relatedTerms.length > 0) {
                            const safeRelatedTerms = relatedTerms.filter(term =>
                                term && term.toLowerCase() !== mainTerm.toLowerCase() &&
                                !mainTerm.toLowerCase().includes(term.toLowerCase())
                            );

                            safeRelatedTerms.forEach(relatedTerm => {
                                const relatedRegex = new RegExp(`\\b(${this.escapeRegExp(relatedTerm)})\\b`, 'gi');
                                text = text.replace(relatedRegex, '<strong>$1</strong>');
                            });
                        }

                        const span = document.createElement('span');
                        span.innerHTML = text;
                        node.parentNode.replaceChild(span, node);
                    } else if (node.nodeType === Node.ELEMENT_NODE && !['SCRIPT', 'STYLE', 'CODE', 'PRE'].includes(node.tagName)) {
                        Array.from(node.childNodes).forEach(child => processTextNode(child));
                    }
                };

                Array.from(tempDiv.childNodes).forEach(child => processTextNode(child));
                return tempDiv.innerHTML;
            },

            // Function to toggle between markdown and rendered view
            toggleAnswerViewMode(excerptId) {
                const excerptDiv = document.getElementById(excerptId);
                if (!excerptDiv) return;

                const fullTextContainer = excerptDiv.querySelector('.excerpt-full-text');
                if (!fullTextContainer) return;

                const answerText = fullTextContainer.dataset.answerText;
                const answerHtml = fullTextContainer.dataset.answerHtml;
                const mainTerm = fullTextContainer.dataset.mainTerm || '';
                const relatedItems = JSON.parse(fullTextContainer.dataset.relatedItems || '[]');

                const isCurrentlyRaw = fullTextContainer.classList.contains('markdown-raw');

                if (isCurrentlyRaw && answerHtml) {
                    // Switch to rendered view
                    fullTextContainer.classList.remove('markdown-raw');
                    fullTextContainer.classList.add('markdown-rendered');

                    if (mainTerm) {
                        fullTextContainer.innerHTML = `<div class="markdown-content">${this.highlightHtmlWithTerms(answerHtml, mainTerm, relatedItems)}</div>`;
                    } else {
                        fullTextContainer.innerHTML = `<div class="markdown-content">${answerHtml}</div>`;
                    }

                    // Update button text
                    const toggleBtn = excerptDiv.querySelector('.markdown-toggle-btn');
                    if (toggleBtn) {
                        toggleBtn.textContent = 'View Raw Markdown';
                    }

                    // Don't store preference - always default to rendered
                } else {
                    // Switch to raw view
                    fullTextContainer.classList.add('markdown-raw');
                    fullTextContainer.classList.remove('markdown-rendered');

                    if (mainTerm) {
                        fullTextContainer.innerHTML = `<pre class="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono">${this.highlightWithRelatedTerms(answerText, mainTerm, relatedItems)}</pre>`;
                    } else {
                        fullTextContainer.innerHTML = `<pre class="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono">${this.escapeHtml(answerText)}</pre>`;
                    }

                    // Update button text
                    const toggleBtn = excerptDiv.querySelector('.markdown-toggle-btn');
                    if (toggleBtn) {
                        toggleBtn.textContent = 'View Formatted';
                    }

                    // Don't store preference - always default to rendered
                }
            },

            highlightBrandInText(text, brandValue) {
                if (!brandValue || !text) return this.escapeHtml(text);

                const escapedText = this.escapeHtml(text);
                const escapedBrand = this.escapeRegExp(brandValue);

                // Use lookaround assertions for better word boundary detection
                // This handles brands with dots, hyphens, numbers, etc.
                const regex = new RegExp(`(?<![\\w.-])(${escapedBrand})(?![\\w.-])`, 'gi');

                // Replace with highlighted version using the brand-highlight class
                return escapedText.replace(regex, '<span class="brand-highlight">$1</span>');
            },

            highlightBrandInExcerpt(alreadyProcessedHtml, brandValue) {
                if (!brandValue || !alreadyProcessedHtml) return alreadyProcessedHtml;

                // This function works on already escaped and partially highlighted HTML
                // We need to be careful not to match inside existing HTML tags
                const escapedBrand = this.escapeRegExp(brandValue);

                // Split the HTML into text and tags, process only text parts
                const parts = [];
                let lastIndex = 0;
                const tagRegex = /<[^>]+>/g;
                let match;

                while ((match = tagRegex.exec(alreadyProcessedHtml)) !== null) {
                    // Add text before the tag
                    if (match.index > lastIndex) {
                        const textPart = alreadyProcessedHtml.substring(lastIndex, match.index);
                        // Apply highlighting to text parts only
                        const highlightRegex = new RegExp(`(?<![\\w.-])(${escapedBrand})(?![\\w.-])`, 'gi');
                        parts.push(textPart.replace(highlightRegex, '<span class="brand-highlight">$1</span>'));
                    }
                    // Add the tag as-is
                    parts.push(match[0]);
                    lastIndex = match.index + match[0].length;
                }

                // Add remaining text after last tag
                if (lastIndex < alreadyProcessedHtml.length) {
                    const textPart = alreadyProcessedHtml.substring(lastIndex);
                    const highlightRegex = new RegExp(`(?<![\\w.-])(${escapedBrand})(?![\\w.-])`, 'gi');
                    parts.push(textPart.replace(highlightRegex, '<span class="brand-highlight">$1</span>'));
                }

                return parts.join('');
            },

            resetAllFilters(objId) {
                // Reset search term if exists
                if (this[`${objId}_searchTerm`] !== undefined) {
                    this[`${objId}_searchTerm`] = '';
                }

                // Reset AI engine selection if exists
                if (this[`selected_${objId}_AIModels`] !== undefined) {
                    this[`selected_${objId}_AIModels`] = [];  // Changed to empty array for multi-select
                }

                // Reset appearanceOrder trends if exists
                if (this[`selected_${objId}_appearanceOrder_Trends`] !== undefined) {
                    this[`selected_${objId}_appearanceOrder_Trends`] = [];  // Changed to empty array for multi-select
                }
            },

            darkenColor(color, factor) {
                // Convert hex to RGB
                let r = parseInt(color.slice(1, 3), 16);
                let g = parseInt(color.slice(3, 5), 16);
                let b = parseInt(color.slice(5, 7), 16);

                // Darken each component
                r = Math.floor(r * (1 - factor));
                g = Math.floor(g * (1 - factor));
                b = Math.floor(b * (1 - factor));

                // Convert back to hex
                return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
            },

            getModelIconUrl(botId) {
                const bot = this.bots.find(bot => bot.id === botId);
                const url = bot && bot.url && bot.url.length > 0 ? bot.url : '';
                if (url.length > 0) {
                    return FAVICON_32_TEMPLATE.replace('{{DOMAIN}}', this.extractDomain(url));
                }
                return '';
            },

            getModelIconClassName(botId, isMutedIcon = false) {
                // find bot first
                const bot = this.bots.find(bot => bot.id === botId);
                const isKnownModel = bot !== undefined;
                let outputClass = '';
                if (bot && bot.url && bot.url.length > 0) {
                    // we return emtpy class name so 
                    ; // do nothing
                }
                else {
                    outputClass = `icon_bot_${isKnownModel ? botId : 'unknown'}`;
                }
                // adding muted class if needed
                outputClass += isMutedIcon ? 'muted-icon opacity-50' : '';
                return outputClass;
            },

            checkIfStringIsUrl(str) {
                return URL_DETECTION_PATTERN.test(str);
            },

            get_default_max_visible_item_count(itemCount) {
                const percentLimit = Math.floor(itemCount * VISIBLE_COUNT_BY_DEFAULT_IN_PERCENTS / 100);
                const limit = Math.min(percentLimit, VISIBLE_COUNT_BY_DEFAULT_MAX); // Cap at max visible items
                if (IS_DEBUG) {
                    console.debug(`DEBUG: get_default_max_visible_item_count(${itemCount}): ${limit}`);
                }
                return limit > VISIBLE_COUNT_BY_DEFAULT_HARD_MIN_LIMIT ? limit : VISIBLE_COUNT_BY_DEFAULT_HARD_MIN_LIMIT;
            },

            filterBySelected_AIModels(obj, items, selectedEngines) {
                // If selectedEngines is empty array or not provided, return all items
                if (!selectedEngines || !Array.isArray(selectedEngines) || selectedEngines.length === 0) {
                    return items;
                }
                const field = obj.botFilteredFields ? obj.botFilteredFields[0] : null;
                if (!field) {
                    throw new Error(`No field to filter bots by`);
                }
                // Filter by array of selected engines
                return items.filter(item => {
                    const itemModelIds = item[field].split(',').map(id => id.trim());
                    return itemModelIds.some(id => selectedEngines.includes(id));
                });
            },

            filterBySelected_appearanceOrder_Trends(items, selectedTrends) {
                // If selectedTrends is empty array or not provided, return all items
                if (!selectedTrends || !Array.isArray(selectedTrends) || selectedTrends.length === 0) {
                    return items;
                }

                // Convert trends to numbers and filter
                const numericTrends = selectedTrends.map(t => Number(t));
                return items.filter(item => {
                    const itemTrend = item.appearanceOrderTrend;
                    return numericTrends.includes(itemTrend);
                });

            },

            /*
            filterBySelected_AIModels(items, selectedEngines) {
                //console.log(`Selected engines: ${selectedEngines}, items.length: ${items.length}`);
                // if all selected, return all items
                if (selectedEngines.length === this.bots.length) {
                    return items;
                }
                // if none selected, return empty array
                if (selectedEngines.length === 0) {
                    return []; // If no engines are selected, return all items
                }
                // otherwise filter by selected engines
                const filteredItems = items.filter(item => {
                    const itemModelIds = item.bots.split(',').map(id => id.trim());
                    return itemModelIds.some(id => selectedEngines.includes(id));
                });
                console.log(`filteredItems.length: ${filteredItems.length}`);
                return filteredItems;
            },
            */


            showDataHint(event) {
                if (this.isTouchDevice && event.type !== 'click') return;

                let element = event.target;

                let title = element.getAttribute('data-title');
                let hint = element.getAttribute('data-hint');

                if (!title && !hint) {
                    console.debug(`No title or hint found for element: ${element}, trying to get from closesst`);
                    element = element.closest('[data-title],[data-hint]');
                    if (!element) {
                        console.warn(`No title or hint found for element: ${element}, trying to get from closest parent`);
                    }
                    else {
                        title = element.getAttribute('data-title');
                        hint = element.getAttribute('data-hint');
                    }
                }


                if (!title && !hint) {
                    console.debug(`No title or hint found for element: ${element}`);
                    return;
                }

                //console.debug(`Found element: ${element}, title: ${title}, hint: ${hint}`);

                const existingHint = document.getElementById('data-hint');
                if (existingHint) {
                    existingHint.remove();
                }

                const hintElement = document.createElement('div');
                hintElement.id = 'data-hint';
                hintElement.innerHTML = `<strong>${title}</strong>${hint ? '<br>' + hint.replace(/\n/g, '<br>') : ''}`;
                hintElement.style.cssText = `
                    position: fixed;
                    z-index: 1000;
                    background-color: rgba(0, 0, 0, 0.8);
                    color: white;
                    padding: 8px 12px;
                    border-radius: 4px;
                    font-size: 14px;
                    max-width: 80vw;
                    word-wrap: break-word;
                `;

                document.body.appendChild(hintElement);

                const rect = element.getBoundingClientRect();
                const hintRect = hintElement.getBoundingClientRect();

                let top = rect.top - hintRect.height - 4;
                let left = rect.left + (rect.width / 2) - (hintRect.width / 2);

                if (top < 10) {
                    top = rect.bottom + 4;
                }

                if (left < 10) {
                    left = 10;
                } else if (left + hintRect.width > window.innerWidth - 10) {
                    left = window.innerWidth - hintRect.width - 10;
                }

                hintElement.style.top = `${top}px`;
                hintElement.style.left = `${left}px`;

                if (this.isTouchDevice) {
                    setTimeout(() => {
                        document.addEventListener('click', this.removeDataHint);
                    }, 0);
                }
            },

            removeDataHint(event) {
                console.debug(`removeDataHint: ${event}`);
                // find existing data hint element that we need to remove
                const hintElement = document.getElementById('data-hint');
                if (
                    hintElement &&
                    (!event || // if event is not null
                        (event && event.target !== hintElement) // make sure we are not removing hint for the same element that we added it to
                    )
                ) {
                    hintElement.remove();
                    document.removeEventListener('click', this.removeDataHint);
                }
            },




            getTrendDescription(trend, includeSymbol = true) {
                let desc = '';
                switch (Number(trend)) {
                    case TRENDS.UP: desc = 'Growing'; break;
                    case TRENDS.DOWN: desc = 'Declining'; break;
                    case TRENDS.STABLE: desc = 'Stable'; break;
                    case TRENDS.NEW: desc = 'New'; break;
                    case TRENDS.DISAPPEARED: desc = 'Disappeared'; break;
                    case TRENDS.FLUCTUATING: desc = 'Fluctuating'; break;
                    case TRENDS.UNKNOWN: desc = 'Accumulating Data'; break;
                    default: desc = 'Accumulating Data';
                }
                return includeSymbol ? `${this.getTrendSymbol(trend)} ${desc}` : desc;
            },


            dateToString(d) {
                if (!d) {
                    return NA_VALUE_CAPTION;
                }
                return new Date(d).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
            },

            initializeBrandSelection() {
                // Check localStorage for previously selected brands
                const savedBrandIds = localStorage.getItem('selectedBrandIds');

                if (savedBrandIds) {
                    try {
                        const brandIds = JSON.parse(savedBrandIds);
                        brandIds.forEach(id => {
                            const [entityType, ...valueParts] = id.split('-');
                            const entityValue = valueParts.join('-');
                            const entity = this[entityType]?.find(item => item.value === entityValue);
                            if (entity) {
                                // Check if this brand is already selected to avoid duplicates
                                const isAlreadySelected = this.selectedItems.some(b =>
                                    b.entityType === entityType && b.value === entityValue
                                );
                                if (!isAlreadySelected) {
                                    this.selectedItems.push({
                                        ...entity,
                                        entityType: entityType
                                    });
                                }
                            }
                        });
                        if (this.selectedItems.length > 0) return;
                    } catch (e) {
                        console.warn('Failed to restore brand selection');
                    }
                }

                // If no saved selection, check for brand.md data
                if (this.brand && this.brand.name) {
                    // Store the original brand from brand.md
                    this.defaultBrand = this.brand;

                    // Find matching entity with isBrand: true
                    for (const arrayName of ENTITES_NON_COMPUTED) {
                        const items = this[arrayName] || [];
                        const foundItem = items.find(item => item.isBrand === true);
                        if (foundItem) {
                            // Check if this brand is already selected to avoid duplicates
                            const isAlreadySelected = this.selectedItems.some(b =>
                                b.entityType === arrayName && b.value === foundItem.value
                            );
                            if (!isAlreadySelected) {
                                this.selectedItems.push({
                                    ...foundItem,
                                    entityType: arrayName
                                });
                            }
                            return;
                        }
                    }
                }

                // If no brand.md or no matching entity, select the highest-influence entity
                const allEntities = this.getAllEntities;
                if (allEntities && allEntities.length > 0) {
                    const topEntity = allEntities[0]; // Already sorted by influence
                    const entity = this[topEntity.entityType]?.find(item => item.value === topEntity.value);
                    if (entity) {
                        // Check if this brand is already selected to avoid duplicates
                        const isAlreadySelected = this.selectedItems.some(b =>
                            b.entityType === topEntity.entityType && b.value === entity.value
                        );
                        if (!isAlreadySelected) {
                            this.selectedItems.push({
                                ...entity,
                                entityType: topEntity.entityType
                            });
                        }
                    }
                }
            },


            getModelIconAsHtml(engine) {
                const foundEngine = this.bots.find(b => b.id === engine);
                let engineName = engine;
                if (foundEngine) {
                    engineName = foundEngine.name;
                }
                else {
                    console.warn(`Model not found for engine: ${engine}`);
                    engine = 'unknown';
                }
                return `<div class="icon_bot-container"><a href="#" class="has-data-hint icon_bot icon_graph_bot_${engine}" title="${engineName}">${engineName.charAt(0)}</a></div>`;
            },


            decimalToStringWithExtraPrecisionOnlyIfNeeded(inputNum, precision = 2) {
                // Convert to number in case input is string
                const num = Number(inputNum);

                // Handle NaN
                if (isNaN(num)) {
                    return NA_VALUE_CAPTION;
                }

                // Check if number is whole (has no decimal locations)
                if (Number.isInteger(num)) {
                    return num.toString();
                }

                // For very small numbers (less than 1), show one decimal place
                return num.toFixed(precision);

            },

            // returns data for hint, includes object with trend, title, hint, and botName
            generateHintData(parentContainerId, botId, item, trendType, isShortFormat = false) {

                let trendForSelectedModel = [];
                let trendValsForSelectedModel = [];

                if (!botId) {
                    botId = this.ALL_MODELS_OPTION_CAPTION;
                }


                if (trendType === 'mentions') {
                    if (botId === this.ALL_MODELS_OPTION_CAPTION) {
                        trendForSelectedModel.push(item.mentionsTrend);
                        trendValsForSelectedModel.push(item.mentionsTrendVals);
                    } else {
                        trendForSelectedModel.push(item.mentionsByModelTrend[botId]);
                        trendValsForSelectedModel.push(item.mentionsByModelTrendVals[botId]);
                    }
                } else if (trendType === 'appearanceOrder') {
                    if (botId === this.ALL_MODELS_OPTION_CAPTION) {
                        trendForSelectedModel.push(item.appearanceOrderTrend);
                        trendValsForSelectedModel.push(item.appearanceOrderTrendVals);
                    } else {
                        if (!item.appearanceOrderByModelTrend) {
                            throw new Error(`No appearanceOrderByModelTrend found for engine: ${botId}, item.value: ${item.value}, container: ${parentContainerId}`);
                        }
                        trendForSelectedModel.push(item.appearanceOrderByModelTrend[botId]);
                        trendValsForSelectedModel.push(item.appearanceOrderByModelTrendVals[botId]);
                    }
                } else if (trendType === 'influence') {
                    if (botId === this.ALL_MODELS_OPTION_CAPTION) {
                        trendForSelectedModel.push(item.influenceTrend);
                        trendValsForSelectedModel.push(item.influenceTrendVals);
                    } else {
                        trendForSelectedModel.push(item.influenceByModelTrend[botId]);
                        trendValsForSelectedModel.push(item.influenceByModelTrendVals[botId]);
                    }
                } else if (trendType === 'modelCount') {
                    // modelCount is always for all models, not per-model
                    trendForSelectedModel.push(item.modelCountTrend);
                    trendValsForSelectedModel.push(item.modelCountTrendVals);
                }

                if (trendForSelectedModel.length === 0) {
                    console.debug(`No trends found for engine: ${botId}`);
                    trendForSelectedModel.push(TRENDS.UNKNOWN);
                }
                if (trendValsForSelectedModel.length === 0) {
                    console.debug(`No trend values found for engine: ${botId}`);
                    trendValsForSelectedModel.push({});
                }


                const itemModelNames = this.getModelNameById(item?.bots, parentContainerId);
                const selectedModelMainName = this.getModelNameById(botId, parentContainerId);


                const latestTrend = trendForSelectedModel[0];


                let latestValItem = null;
                let latestDate = null;
                let latestVal = null;


                if (trendValsForSelectedModel && trendValsForSelectedModel[0] && trendValsForSelectedModel[0].length > 0) {
                    latestValItem = trendValsForSelectedModel[0][0];
                    latestDate = latestValItem.date;
                    latestVal = latestValItem.value;
                }

                if (latestVal !== null && latestVal !== '' && latestVal > 0) {
                    if (trendType === 'influence') {
                        latestVal = this.decimalToPercentsAsString(latestVal);
                    } else {
                        // other values like mentions/appearanceOrders are not in percents
                        latestVal = this.decimalToStringWithExtraPrecisionOnlyIfNeeded(latestValItem.value);
                    }
                }
                else

                    latestVal = NA_VALUE_CAPTION;

                let trendHint = '';

                let trendHints = []
                if (trendValsForSelectedModel && trendValsForSelectedModel[0] && trendValsForSelectedModel[0].length > 0) {
                    trendHints = trendValsForSelectedModel[0].map(
                        el => {
                            if (trendType === 'influence') {
                                // influence is in percents like 0.24 etc
                                return `${el.value && el.value > -1 ? this.decimalToPercentsAsString(el.value) : NA_VALUE_CAPTION} (${this.dateToString(el.date)}) `;
                            } else {
                                // other values like mentions/appearanceOrders are not in percents
                                return `${el.value && el.value > -1 ? this.decimalToStringWithExtraPrecisionOnlyIfNeeded(el.value, 2) : NA_VALUE_CAPTION} (${this.dateToString(el.date)})`;
                            }
                        }
                    );
                }
                else {
                    trendHints.push('Accumulating Data');
                }


                let finalHint = null;

                if (isShortFormat) {
                    // in short format we show just the last data point and the whole format is like this:
                    // AppearanceOrder: → Stable (Oct 9, 2024: 13%)
                    finalHint = `${this.capitalizeFirstLetter(trendType)}: ${latestVal} ${this.getTrendDescription(latestTrend)}`;// (${this.dateToString(latestDate)})`;
                } else {
                    finalHint = `${this.capitalizeFirstLetter(trendType)}: ${latestVal} ${this.getTrendDescription(trendForSelectedModel[0])}\n${trendHints.join('\n')}`;
                }

                return {

                    trend: trendForSelectedModel,
                    trendType: trendType,
                    trendValues: trendValsForSelectedModel,

                    title: selectedModelMainName, // botNames,
                    hint: finalHint,
                    botName: selectedModelMainName, // only current selected bot
                    botNames: itemModelNames // all bot names
                }
            },

            getModelIconsWithHintsAsHtml(parentContainerId, item, trendType, currentModel = null, enableContraction = false) {
                // Safety check for item
                if (!item || !item.bots) {
                    return '';
                }

                // get list of bots for item
                const engines = item.bots.split(',').map(e => e.trim());

                // generate icon for every engine with its own trend and hint 
                const generateIconHtml = (botId, trendType, isMutedIcon = false) => {

                    const result = this.generateHintData(parentContainerId, botId, item, trendType);

                    const botClass = this.getModelIconClassName(botId, isMutedIcon);
                    const botIconUrl = this.getModelIconUrl(botId);
                    let botNameHtml = '';
                    if (botIconUrl && botIconUrl.length > 0) {
                        botNameHtml = `<img src="${botIconUrl}" 
                        width="16" 
                        height="16" 
                        alt="${result.title}" 
                        class="has-data-hint"` +

                            `data-trend="${result.trend}"` +

                            `data-title="${result.title}" data-hint="${result.hint}"
                        >
                        `;
                    } else {
                        botNameHtml = result.title.charAt(0).toUpperCase();
                    }

                    return `
                        <span class="has-data-hint icon_bot trend-icon ${botClass}"` +

                        `data-trend="${result.trend}"` +

                        `data-title="${result.title}"
                           data-hint="${result.hint}">
                            ${botNameHtml}
                        </span>
                    `;
                };

                let finalHtml = '';

                if (currentModel) {
                    const otherEngines = engines.filter(engine => engine !== currentModel);

                    finalHtml += `<div class="icon_bot-container"><div class="icon_bot-grid">`;
                    finalHtml += generateIconHtml(currentModel, trendType);
                    /*
                    if (otherEngines.length > 0) {
                        finalHtml += `<span class="ml-2">${this.getModelNameById(currentModel)}</span>`;
                    }
                    */
                    finalHtml += `</div></div>`;

                    if (otherEngines.length > 0) {
                        finalHtml += `<div class="other-bots text-sm text-gray-500 mt-1">`;
                        finalHtml += `also appears in: `;
                        finalHtml += `<div class='icon_bot-grid'>`;
                        finalHtml += otherEngines.map(engine => generateIconHtml(engine, trendType, true)).join(' ');
                        finalHtml += `</div>`;
                        finalHtml += `</div>`;
                    }
                } else {
                    // Check if we should use contraction (expandable) feature
                    if (enableContraction && engines.length > 1) {
                        // Generate unique ID for this icon group
                        const itemIdentifier = (item.name || item.title || item.link || 'item').toString().replace(/[^a-zA-Z0-9]/g, '_');
                        const uniqueId = `icons_${parentContainerId}_${itemIdentifier}_${trendType}_${Math.random().toString(36).substr(2, 9)}`;

                        // Show first icon with expandable "+N" indicator
                        const firstIcon = generateIconHtml(engines[0], trendType);
                        const remainingIcons = engines.slice(1).map(engine => generateIconHtml(engine, trendType)).join(' ');
                        const remainingCount = engines.length - 1;

                        finalHtml = `
                            <div class='icon_bot-container' data-icon-group-id='${uniqueId}'>
                                <div class='icon_bot-grid'>
                                    ${firstIcon}
                                    <span class="icon-expand-badge" id="${uniqueId}_badge" onclick="window.app.toggleModelIcons('${uniqueId}', event)" title="Show ${remainingCount} more model${remainingCount > 1 ? 's' : ''}">
                                        +${remainingCount}
                                    </span>
                                    <span class="icon-expanded-items" id="${uniqueId}_expanded" style="display: none;">
                                        ${remainingIcons}
                                    </span>
                                </div>
                            </div>`;
                    } else {
                        // Show all icons without contraction
                        finalHtml = `<div class='icon_bot-container'><div class='icon_bot-grid'>${engines.map(engine => generateIconHtml(engine, trendType)).join(' ')}</div></div>`;
                    }
                }

                return finalHtml;
            },


            toggleModelIcons(uniqueId, event) {
                // Prevent event from bubbling up
                if (event) {
                    event.stopPropagation();
                }

                const expandedElement = document.getElementById(`${uniqueId}_expanded`);
                const badgeElement = document.getElementById(`${uniqueId}_badge`);

                if (expandedElement && badgeElement) {
                    if (expandedElement.style.display === 'none') {
                        // Expand - show all icons
                        expandedElement.style.display = 'inline';
                        badgeElement.style.display = 'none';
                    } else {
                        // Collapse - show only first icon with badge
                        expandedElement.style.display = 'none';
                        badgeElement.style.display = 'inline-flex';
                    }
                }
            },


            getTrendSymbolAsHtml(parentContainerId, item, trendType, engine = null) {

                let trend = null;
                let trendValues = null;

                if (!engine) {
                    engine = this.ALL_MODELS_OPTION_CAPTION;
                }

                if (trendType === 'mentions') {
                    if (engine === this.ALL_MODELS_OPTION_CAPTION) {
                        trend = item.mentionsTrend;
                        trendValues = item.mentionsTrendVals;
                    } else {
                        trend = item.mentionsByModelTrend[engine];
                        trendValues = item.mentionsByModelTrendVals[engine];
                    }
                } else if (trendType === 'appearanceOrder') {
                    if (engine === this.ALL_MODELS_OPTION_CAPTION) {
                        trend = item.appearanceOrderTrend;
                        trendValues = item.appearanceOrderTrendVals;
                    } else {
                        trend = item.appearanceOrderByModelTrend[engine];
                        trendValues = item.appearanceOrderByModelTrendVals[engine];
                    }
                } else if (trendType === 'influence') {
                    if (engine === this.ALL_MODELS_OPTION_CAPTION) {
                        trend = item.influenceTrend;
                        trendValues = item.influenceTrendVals;
                    } else {
                        trend = item.influenceByModelTrend[engine];
                        trendValues = item.influenceByModelTrendVals[engine];
                    }
                } else if (trendType === 'modelCount') {
                    // modelCount is always for all models, not per-model
                    trend = item.modelCountTrend;
                    trendValues = item.modelCountTrendVals;
                }

                const hintData = this.generateHintData(parentContainerId, engine, item, trendType);


                return `
                    <span
                        class="has-data-hint trend-icon ${this.getTrendColorClass(trend)} relative"
                        data-trend="${trend}"
                        data-title="${this.getModelNameById(engine)}"
                        data-hint="${hintData.hint}"
                    >
                        ${this.getTrendSymbol(trend)}
                    </span>
                `;
            },


            calculateTrendFromTrendVals(dataArray) {

                // if data array is just one element 
                if (dataArray.length == 1) {
                    return TRENDS.UNKNOWN;
                }

                // Filter out entries where value is null (data not available)
                const validData = dataArray.filter(entry => entry.value !== null && entry.value !== '');

                // Check for insufficient data
                if (validData.length == 0) {
                    // No valid data or only one data point not at the latest date
                    return TRENDS.UNKNOWN;
                }

                // Extract dates and values from valid data
                const dates = validData.map(entry => new Date(entry.date));
                const values = validData.map(entry => parseFloat(entry.value));

                // Ensure values array has no NaNs
                if (values.some(isNaN)) {
                    return TRENDS.UNKNOWN;
                }

                // Check if the latest data point is missing
                const latestEntry = dataArray[0];
                const latestValue = latestEntry.value !== null && latestEntry.value !== '' ? parseFloat(latestEntry.value) : null;

                // if no data previously
                if (latestValue === null) {
                    // Cannot determine trend without the latest data
                    return TRENDS.UNKNOWN;
                }


                // Check if the latest value is non-zero and all previous are zero or missing
                const previousValues = validData.slice(1).map(entry => parseFloat(entry.value));
                if (latestValue !== 0 && previousValues.every(v => v === 0 || v === null || isNaN(v))) {
                    return TRENDS.NEW;
                }

                // Check if the latest value is zero and previous values are non-zero
                if (
                    latestValue === 0 &&
                    previousValues.some(v => v !== 0 && v !== null)
                ) {
                    return TRENDS.DISAPPEARED;
                }

                // Prepare data for regression
                const x = []; // Time in days since earliest date
                const y = []; // Corresponding values

                // Use all valid data points
                const earliestDate = new Date(Math.min(...dates.map(date => date.getTime())));

                for (let i = 0; i < dates.length; i++) {
                    const timeDiff = (dates[i] - earliestDate) / (24 * 60 * 60 * 1000); // Convert milliseconds to days
                    x.push(timeDiff);
                    y.push(values[i]);
                }

                if (x.length < 2) {
                    return TRENDS.UNKNOWN; // Not enough data for trend analysis
                }

                // Perform linear regression to calculate the slope
                const n = x.length;
                const sumX = x.reduce((sum, xi) => sum + xi, 0);
                const sumY = y.reduce((sum, yi) => sum + yi, 0);
                const sumXY = x.reduce((sum, xi, idx) => sum + xi * y[idx], 0);
                const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);

                const denominator = n * sumX2 - sumX * sumX;

                if (denominator === 0) {
                    return TRENDS.UNKNOWN; // Cannot compute slope
                }

                const slope = (n * sumXY - sumX * sumY) / denominator;

                // Define a threshold for significant slope (adjust as needed)
                const TREND_SIGNIFICANT_SLOPE_THRESHOLD = 0.01; // Adjust based on data scale

                // Determine the trend based on the slope
                if (Math.abs(slope) < TREND_SIGNIFICANT_SLOPE_THRESHOLD) {
                    // Calculate standard deviation to check for fluctuation
                    const meanY = sumY / n;
                    const residuals = y.map((yi, idx) => yi - (slope * x[idx] + meanY));
                    const variance = residuals.reduce((sum, ri) => sum + ri * ri, 0) / n;
                    const stdDev = Math.sqrt(variance);

                    // Define a fluctuation threshold (adjust as needed)
                    const fluctuationThreshold = meanY * 0.1; // 10% of the mean value

                    if (stdDev > fluctuationThreshold) {
                        return TREND.FLUCTUATING;
                    }

                    return TRENDS.STABLE;
                } else if (slope > 0) {
                    return TRENDS.UP;
                } else if (slope < 0) {
                    return TRENDS.DOWN;
                } else {
                    return TRENDS.UNKNOWN; // Catch-all for unexpected cases
                }
            },


            getAppData() {
                const dataKey = `AppData${CURRENT_REPORT_DATA_DATE.replace(/-/g, '')}`;

                if (window[dataKey]) {
                    return window[dataKey];
                } else {
                    console.error(`Data for ${dataKey} not found. Available keys: ${Object.keys(window).join(', ')}`);
                    // Instead of throwing an error, return an empty object or a default data structure
                    return {};
                }
            },

            // Add this method to your methods object
            truncateString(str, maxLength = MAX_NON_TRUNCATED_STRING_LENGTH) {
                if (str.length <= MAX_NON_TRUNCATED_STRING_LENGTH) return str;
                return str.slice(0, MAX_NON_TRUNCATED_STRING_LENGTH - 3) + '[...]';
            },


            capitalizeFirstLetter(string) {
                return string.charAt(0).toUpperCase() + string.slice(1);
            },

            toggleSummaryShowMore(elementId) {
                const trimmedContent = document.getElementById(`text-content-trimmed-${elementId}`);
                const fullContent = document.getElementById(`text-content-full-${elementId}`);
                const readMoreBtn = document.getElementById(`text-content-read-more-btn-${elementId}`);

                if (trimmedContent.classList.contains('hidden')) {
                    trimmedContent.classList.remove('hidden');
                    fullContent.classList.add('hidden');
                    readMoreBtn.textContent = 'Read more';
                } else {
                    trimmedContent.classList.add('hidden');
                    fullContent.classList.remove('hidden');
                    readMoreBtn.textContent = 'Read less';
                }
            },

            calculateInfluence(botIdsString) {
                const botIds = botIdsString.split(',').map(id => id.trim());
                const usedModels = new Set(botIds);
                const maxPossibleInfluence = Array.from(usedModels).reduce((sum, botId) => sum + (this.botWeights.get(botId) || 0), 0);
                const weightedInfluence = maxPossibleInfluence / this.totalModelWeight;
                return Math.min(1, Math.max(0, weightedInfluence));
            },

            getLinkTypeLink(linkType) {
                const linkTypeExample = this.linkTypeExamples.find(example => example.name === linkType);
                return linkTypeExample ? linkTypeExample.links[0] : '';
            },

            // Helper to get link type name from code using injected data
            getLinkTypeName(code) {
                // Normalize and handle placeholders
                const c = (code || '').toString().trim().toLowerCase();
                if (!c || c.includes('?')) {
                    return 'Other';
                }
                // Use the linkTypeNames mapping from AppDataStatic if available
                if (window.AppDataStatic && window.AppDataStatic.linkTypeNames) {
                    return window.AppDataStatic.linkTypeNames[c] || 'Other';
                }
                // Fallback default for very old reports
                return c;
            },

            // Helper to get link type code from name (reverse lookup)
            getLinkTypeCode(name) {
                if (window.AppDataStatic && window.AppDataStatic.linkTypeNames) {
                    for (const [code, typeName] of Object.entries(window.AppDataStatic.linkTypeNames)) {
                        if (typeName === name) {
                            return code;
                        }
                    }
                }
                return name; // Return name if no code found
            },

            getComplexityAsString(complexity) {
                switch (complexity) {
                    case 1: return 'easy'; break;
                    case 2: return 'normal'; break;
                    case 3: return 'hard'; break;
                    default:
                        throw new Error(`Unsupported complexity`);
                }

            },

            // returns array of bot names with counts like `Google Gemini (2), Brave Seach (3)` etc

            copyElementToClipboard(elementId, button) {
                const element = document.getElementById(elementId);
                if (!element) return;

                const text = element.value || element.innerText || element.textContent;

                navigator.clipboard.writeText(text).then(() => {
                    const originalText = button.textContent;
                    button.textContent = 'Copied!';
                    button.disabled = true;
                    setTimeout(() => {
                        button.textContent = originalText;
                        button.disabled = false;
                    }, 2000);
                }, (err) => {
                    console.error('Could not copy text: ', err);
                    button.textContent = 'Failed to copy';
                    setTimeout(() => {
                        button.textContent = originalText;
                    }, 2000);
                });
            },

            closeModal() {
                this.showPromptModal = false;
            },

            handleEscKey(event) {
                if (event.key === 'Escape' && this.showPromptModal) {
                    this.closeModal();
                }
            },

            scaleGraph(graphId) {
                // Adjust padding based on screen size
                const isMobile = window.innerWidth <= 768;
                const CONTAINER_WIDTH_PADDING = isMobile ? 40 : 200 * this.getVisualScalingFactorForGraph();
                const CONTAINER_HEIGHT_PADDING = isMobile ? 20 : 100 * this.getVisualScalingFactorForGraph();

                const container = document.getElementById(graphId);
                const svg = d3.select(`#${graphId} svg`);
                const graphContent = svg.select("g");

                if (!container || !graphContent.node()) {
                    console.warn(`Unable to scale graph ${graphId}. Container or content not found.`);
                    return;
                }

                const containerWidth = container.clientWidth;
                const containerHeight = container.clientHeight;
                const bounds = graphContent.node().getBBox();

                // Calculate scale with minimum and maximum bounds
                const minScale = isMobile ? 0.4 : 0.6;
                const maxScale = isMobile ? 2 : 4;
                const baseScale = Math.min(
                    (containerWidth - CONTAINER_WIDTH_PADDING) / bounds.width,
                    (containerHeight - CONTAINER_HEIGHT_PADDING) / bounds.height
                );
                const scale = Math.min(Math.max(baseScale, minScale), maxScale);

                // Center the graph
                const translateX = (containerWidth - bounds.width * scale) / 2 - bounds.x * scale;
                const translateY = (containerHeight - bounds.height * scale) / 2 - bounds.y * scale;

                graphContent.attr("transform", `translate(${translateX},${translateY}) scale(${scale})`);

                // Update SVG viewBox
                const viewBoxPadding = isMobile ? 20 : 100;
                svg.attr("viewBox", `0 0 ${containerWidth + viewBoxPadding} ${containerHeight + viewBoxPadding}`);
            },

            // define boundary to graph 
            boundaryConstraint(width, height) {
                const padding = 10; // Adjust this value to set the padding from the edges
                return function (d) {
                    d.x = Math.max(padding, Math.min(width - padding, d.x));
                    d.y = Math.max(padding, Math.min(height - padding, d.y));
                };
            },

            getLabelColor() {
                return this.isDarkMode ? '#f3f4f6' : '#333333'; // Brighter text in dark mode
            },

            updateLabelColors() {
                d3.selectAll('.labels text')
                    .style('fill', this.getLabelColor())
                    .style('transition', 'fill 0.3s ease');
            },


            getColorFromStringAndSize(inputStr, calculatedSize = undefined) {

                // Only return gray for truly undefined influence, not for 0
                // This ensures nodes get proper colors even when influence is 0
                if (calculatedSize === undefined) {
                    calculatedSize = 0.0001; // Use minimal influence to get color
                }

                // Normalize string by trimming and converting to lowercase
                const normalizedStr = inputStr.trim().toLowerCase();

                // Generate consistent hash from string
                let hash = 0;
                for (let i = 0; i < normalizedStr.length; i++) {
                    const char = normalizedStr.charCodeAt(i);
                    hash = ((hash << 5) - hash) + char;
                    hash = hash & hash;
                }

                // Define base colors that will be used

                // Get consistent base color for this string
                const baseColor = GRAPH_NODE_COLORS[Math.abs(hash) % GRAPH_NODE_COLORS.length];

                // Ensure influence is between 0.0001 and 1
                const safeInfluence = calculatedSize === undefined ? 0.0001 : Math.max(0.0001, Math.min(1, calculatedSize));

                // Convert base color to RGB
                const r = parseInt(baseColor.slice(1, 3), 16);
                const g = parseInt(baseColor.slice(3, 5), 16);
                const b = parseInt(baseColor.slice(5, 7), 16);

                // Use influence to adjust brightness/saturation, not opacity
                // Higher influence = brighter color, lower influence = darker/muted color
                const brightnessMultiplier = 0.4 + (safeInfluence * 0.6); // Range from 0.4 to 1.0

                // Apply brightness adjustment
                const adjustedR = Math.round(r * brightnessMultiplier);
                const adjustedG = Math.round(g * brightnessMultiplier);
                const adjustedB = Math.round(b * brightnessMultiplier);

                // Convert to hex (without alpha for solid colors)
                const rHex = adjustedR.toString(16).padStart(2, '0');
                const gHex = adjustedG.toString(16).padStart(2, '0');
                const bHex = adjustedB.toString(16).padStart(2, '0');

                return `#${rHex}${gHex}${bHex}`; // Return solid color without alpha
            },


            cleanAndMinimizeUrl(link, outputDomainOnly = false) {
                try {
                    //return link.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
                    if (outputDomainOnly) {
                        return this.extractDomain(link);
                    }
                    else
                        return link.replace(/^https?:\/\/(www\.)?/, '').replace(/^www./, '').replace(/\/$/, '');

                }
                catch (e) {
                    return link;
                }
            },

            decimalToPercentsAsString(num, precision = 2) {
                if (num === undefined || num === null)
                    throw new Error(`Can not convert: Input number is undefined: ${num}`);
                //return Math.round(num * 100%);
                return `${this.decimalToStringWithExtraPrecisionOnlyIfNeeded(num * 100, precision)}%`;
            },

            sortTable(tableId, column) {
                const table = document.getElementById(tableId);
                const tbody = table.querySelector('tbody');
                const rows = Array.from(tbody.querySelectorAll('tr'));

                const sortDirection = this.getSortDirection(table, column);

                rows.sort((a, b) => {
                    const aCell = a.querySelector(`td[data-column="${column}"]`);
                    const bCell = b.querySelector(`td[data-column="${column}"]`);

                    if (!aCell || !bCell) {
                        console.error(`Column ${column} not found in table rows`);
                        return 0;
                    }

                    let aValue, bValue = null;

                    if (aCell.hasAttribute('data-value') && bCell.hasAttribute('data-value')) {
                        aValue = aCell.getAttribute('data-value');
                        bValue = bCell.getAttribute('data-value');
                    } else {
                        aValue = aCell.textContent.trim();
                        bValue = bCell.textContent.trim();
                    }

                    if (NUMERIC_COLUMN_HEADERS.includes(column)) {
                        aValue = parseFloat(aValue);
                        bValue = parseFloat(bValue);
                        console.debug(`DEBUG: sortDirection: ${sortDirection}, aValue: ${aValue}, bValue: ${bValue}`);
                        return sortDirection * (aValue - bValue);
                    } else {
                        return sortDirection * aValue.localeCompare(bValue);
                    }
                });

                tbody.innerHTML = '';
                rows.forEach(row => tbody.appendChild(row));

                this.updateSortIcons(table, column, sortDirection);
            },

            getSortDirection(table, column) {
                const header = table.querySelector(`th[data-sort="${column}"]`);
                const currentDirection = header.getAttribute('data-direction') || 'asc';
                const newDirection = currentDirection === 'asc' ? 'desc' : 'asc';
                header.setAttribute('data-direction', newDirection);
                return newDirection === 'asc' ? 1 : -1;
            },

            updateSortIcons(table, column, direction) {
                table.querySelectorAll('th[data-sort]').forEach(th => {

                    let icon = th.querySelector('.sort-icon');
                    if (!icon) {
                        icon = document.createElement('span');
                        icon.className = 'sort-icon';
                        th.appendChild(icon);
                    }
                    if (th.getAttribute('data-sort') === column) {
                        icon.textContent = direction === 1 ? '\u25B2' : '\u25BC';
                    } else {
                        icon.textContent = '\u25B2';
                    }
                });
            },

            initSortableTables() {
                console.debug(`initSortableTables - begin`);
                const tables = document.querySelectorAll('.sortable-table');
                tables.forEach(table => {
                    const tableId = table.id;
                    table.querySelectorAll('th[data-sort]').forEach(th => {
                        th.addEventListener('click', () => {
                            const column = th.getAttribute('data-sort');
                            this.sortTable(tableId, column);
                        });
                    });
                });
                console.debug(`initSortableTables - end`);

            },


            handleResize() {

                this.CURRENT_VISUAL_OBJECTS_ARRAY.filter(obj => obj.type === 'graph-with-items').forEach(obj => {
                    // Only scale graphs that are already initialized - don't reinitialize
                    if (this[`filtered_${obj.id}`] && this[`filtered_${obj.id}`].length > 0) {
                        // Check if graph container exists and has been initialized
                        const container = document.getElementById(obj.id);
                        if (container && container.querySelector('svg')) {
                            console.debug(`Scaling existing graph ${obj.id} on resize`);
                            this.scaleGraph(obj.id);
                        } else {
                            console.debug(`Graph ${obj.id} not initialized yet, skipping resize`);
                        }
                    }
                });

                // Also handle graphs within tabbed components - only scale if already initialized
                this.CURRENT_VISUAL_OBJECTS_ARRAY.filter(obj => obj.type === 'tabbed-table-graph').forEach(obj => {
                    if (obj.graphConfig && this[`filtered_${obj.graphConfig.id}`] && this[`filtered_${obj.graphConfig.id}`].length > 0) {
                        // Check if graph container exists and has been initialized
                        const container = document.getElementById(obj.graphConfig.id);
                        if (container && container.querySelector('svg')) {
                            console.debug(`Scaling existing tabbed graph ${obj.graphConfig.id} on resize`);
                            this.scaleGraph(obj.graphConfig.id);
                        } else {
                            console.debug(`Tabbed graph ${obj.graphConfig.id} not initialized yet, skipping resize`);
                        }
                    }
                });

                //this.init_chart('sentiments');

                // Apply scaling after a short delay to ensure graphs have rendered
                setTimeout(() => {

                    get_DEFAULT_VISUAL_OBJECTS_ARRAY().filter(visualObject => visualObject.type == 'graph-with-items').forEach(visualObject => {
                        if (this[`filtered_${visualObject.id}`] && this[`filtered_${visualObject.id}`].length > 0) {
                            this.scaleGraph(visualObject.id);
                        }
                    });

                    // Also scale graphs in tabbed components
                    this.CURRENT_VISUAL_OBJECTS_ARRAY.filter(obj => obj.type === 'tabbed-table-graph').forEach(obj => {
                        if (obj.graphConfig && this[`filtered_${obj.graphConfig.id}`] && this[`filtered_${obj.graphConfig.id}`].length > 0) {
                            this.scaleGraph(obj.graphConfig.id);
                        }
                    });
                }, 100);
            },


            init_chart(obj) {
                const chartContainer = document.getElementById(obj.id);
                if (!chartContainer) {
                    console.error(`Chart container not found: ${obj.id}`);
                    return;
                }

                // Destroy existing chart instance if it exists
                if (this.charts && this.charts[obj.id]) {
                    this.charts[obj.id].destroy();
                    delete this.charts[obj.id];
                }

                const canvas = chartContainer.querySelector('canvas');
                const ctx = canvas.getContext('2d');

                // Get data from the source array
                let filteredItems = this[`filtered_${obj.id}`];
                if (!filteredItems) {
                    console.error(`Data not found for chart: ${obj.sourceArrayName}`);
                    return;
                }

                filteredItems = this.sortByGivenColumn(filteredItems, obj.defaultSortingColumn, obj.defaultSortingDirection);

                // Limit chart items to avoid cluttering
                if (filteredItems.length > MIN_CHART_ITEMS) {
                    filteredItems = filteredItems.slice(0, MIN_CHART_ITEMS);
                }

                // filter out items with values less than minValueToUseOtherwiseRemove (if need to)
                /*
                if (obj.minValueToUseOtherwiseRemove !== undefined) {
                    const yColumns = Array.isArray(obj.columns[1]) ? obj.columns[1] : [obj.columns[1]];
                    filteredItems = filteredItems.filter(item => {
                        return yColumns.some(col => item[col.type] > obj.minValueToUseOtherwiseRemove);
                    });
                }
                */

                // updating current_filtered_count
                if (filteredItems.length != this[`total_count_${obj.id}`]) {
                    this[`current_filtered_count_${obj.id}`] = filteredItems.length;
                }
                else {
                    // set to -1 if all items are shown
                    this[`current_filtered_count_${obj.id}`] = -1;
                }

                const xColumns = obj.columns.filter(col => col.chartAxis === 'x');

                // Extract labels and values based on column configuration
                const labels = filteredItems.map(item => {
                    // get label from the very first column that is marked as x axis
                    const xColumnFirst = xColumns[0];
                    let label = item[xColumnFirst.type];
                    if (xColumnFirst.subType === 'botId') {
                        label = this.getModelNameById(label);
                    }
                    // Add trend symbol if applicable based on trends for the first value column
                    const yColumns = obj.columns.filter(col => col.chartAxis === 'y');
                    const yColumnFirst = yColumns[0];
                    const trendSymbol = this.getTrendSymbol(item[yColumnFirst.type + 'Trend']);
                    return `${label} ${trendSymbol}`;
                });
                // Determine if we have multiple values per category
                const yColumns = obj.columns.filter(col => col.chartAxis === 'y');


                // Create datasets array
                let datasets = yColumns.map((valueCol, index) => {

                    // Get raw values
                    const values = filteredItems.map(item => {
                        let value = item[valueCol.type];
                        // do conversion or adjustment if needed
                        // [...]
                        return value;
                    });

                    // Determine color based on overrideColor or default logic
                    let color = 'blue';
                    if (valueCol.overrideColor) {
                        // Use the override color
                        color = valueCol.overrideColor;
                    } else if (yColumns.length === 1) {
                        // Single value case - use colors per category
                        color = filteredItems.map(item =>
                            this.getColorFromStringAndSize(item[obj.columns[0].type], 0.0001)
                        );
                    } else {
                        // Multiple values case - use color from palette
                        color = GRAPH_NODE_COLORS[index % GRAPH_NODE_COLORS.length];
                    }


                    return {
                        label: valueCol.caption,
                        data: values,
                        backgroundColor: Array.isArray(color) ? color : color,
                        borderColor: Array.isArray(color)
                            ? color.map(c => this.darkenColor(c, 0.2))
                            : this.darkenColor(color, 0.2),
                        borderWidth: 1,
                        barPercentage: 0.95,
                        categoryPercentage: 0.95
                    };
                });
                // Determine chart type from config, default to 'bar' if not specified
                const chartType = obj.chartSpecificConfig?.chartType || 'bar';

                // Set a minimum height for the container based on number of items
                const minHeightPerItem = 80; // pixels per bar
                const containerHeight = Math.max(200, labels.length * minHeightPerItem);
                chartContainer.style.height = `${containerHeight}px`;

                const CHART_THEME_LIGHT = {
                    backgroundColor: '#ffffff',
                    textColor: '#333333',
                    gridColor: '#e2e8f0',
                    borderColor: '#e2e8f0'
                };

                const CHART_THEME_DARK = {
                    backgroundColor: '#1a1a1a',
                    textColor: '#e0e0e0',
                    gridColor: '#444444',
                    borderColor: '#444444'
                };


                const isDarkMode = document.documentElement.classList.contains('dark');
                const theme = isDarkMode ? CHART_THEME_DARK : CHART_THEME_LIGHT;


                // Create chart configuration
                const chartConfig = {
                    type: chartType,
                    data: {
                        labels: labels,
                        datasets: datasets
                    },
                    options: {
                        indexAxis: 'y',
                        responsive: true,
                        maintainAspectRatio: false, // This is crucial for flexible height
                        layout: {
                            padding: {
                                left: 10,
                                right: 30,
                                top: 10,
                                bottom: 10
                            }
                        },
                        plugins: {
                            legend: {
                                display: yColumns.length > 1, // Show legend only for multi-value charts
                                position: 'top'
                            },
                            tooltip: {
                                callbacks: {
                                    label: function (context) {
                                        const value = context.raw;
                                        if (obj.chartSpecificConfig?.formatValuesAsPercentage) {
                                            return `${context.dataset.label || ''}: ${(value * 100).toFixed(1)}%`;
                                        }
                                        return `${context.dataset.label || ''}: ${value}`;
                                    }
                                }
                            }
                        },
                        scales: {
                            x: {  // This is now the value axis (showing percentages)
                                grid: {
                                    color: theme.gridColor
                                },
                                ticks: {
                                    color: theme.textColor,
                                    callback: function (value) {
                                        if (obj.chartSpecificConfig?.formatValuesAsPercentage) {
                                            return (value * 100).toFixed(1) + '%';
                                        }
                                        return value;
                                    }
                                }
                            },
                            y: {  // This is now the category axis (showing labels)
                                grid: {
                                    color: theme.gridColor
                                },
                                ticks: {
                                    color: theme.textColor
                                }
                            }
                        }
                    }
                };

                // Merge any custom scale configurations from chartSpecificConfig
                if (obj.chartSpecificConfig?.scales) {
                    chartConfig.options.scales = {
                        ...chartConfig.options.scales,
                        ...obj.chartSpecificConfig.scales
                    };
                }

                // Handle optional data sorting
                if (obj.chartSpecificConfig?.sortData) {
                    const sortedIndices = values.map((v, i) => i)
                        .sort((a, b) => values[a] - values[b]);

                    chartConfig.data.labels = sortedIndices.map(i => labels[i]);
                    chartConfig.data.datasets[0].data = sortedIndices.map(i => values[i]);
                }

                // Adjust dimensions for better horizontal bar display
                chartConfig.options.aspectRatio = 0.7;

                // Optional: Customize bar thickness
                chartConfig.data.datasets[0].barThickness = 20;

                // For horizontal bar charts, swap the axes labels and formatting
                if (chartType === 'horizontalBar') {
                    chartConfig.type = 'bar'; // Chart.js v3+ uses 'bar' with indexAxis: 'y' for horizontal bars
                    chartConfig.options.indexAxis = 'y';

                    // Adjust dimensions for better horizontal bar display
                    chartConfig.options.aspectRatio = 0.7;

                    // Optional: Customize bar thickness
                    chartConfig.data.datasets[0].barThickness = 20;
                }

                // Create new chart instance
                const chart = new Chart(ctx, chartConfig);

                // Store chart instance for cleanup
                if (!this.charts) this.charts = {};
                this.charts[obj.id] = chart;
            },

            sortByGivenColumn(arrayToSort, column, direction = 'desc') {
                if (!column) {
                    return arrayToSort;
                }
                if (IS_DEBUG) {
                    console.debug(`DEBUG arrayToSort: ${JSON.stringify(arrayToSort, null, 2)}`);
                }
                return [...arrayToSort].sort((a, b) => {
                    const aVal = a[column] ?? 0; // default to 0 if undefeinfed/null
                    const bVal = b[column] ?? 0; // default to 0 if undefeinfed/null
                    return direction == 'desc' ? bVal - aVal : aVal - bVal;
                });
            },

            sortLinkTypes(linkTypeCounts) {
                return Object.entries(linkTypeCounts)
                    .sort(([, a], [, b]) => b.mentions - a.mentions)
                    .reduce((r, [k, v]) => ({ ...r, [k]: v }), {});
            },

            getModelNameById(botId, parentContainerId = '') {


                if (botId === undefined || botId === null) {
                    return '';
                }

                // Handle both array and string inputs
                let arrayOfModelIds;
                if (Array.isArray(botId)) {
                    arrayOfModelIds = botId.map(id => id.trim());
                } else if (typeof botId === 'string') {
                    arrayOfModelIds = botId.split(',').map(id => id.trim());
                } else {
                    return '';
                }


                // if we have parent containerId then we can check if we have bots selected or not
                // and if we have all bots selected then we return string like "All"
                if (arrayOfModelIds.length > 1) {
                    // check if we have parentContainerId defined so we should check its bots 
                    if (parentContainerId && parentContainerId != '') {
                        // check if we have multiple botids in botId string
                        if (arrayOfModelIds.length > 1 && this[`${parentContainerId}_bot_ids`].length == arrayOfModelIds.length) {
                            return this.ALL_MODELS_OPTION_CAPTION;
                        };
                    }
                }

                // Example usage:
                // const botId = 'google_gemini';
                // const botName = getModelNameById(botId);
                // console.log(botName); // Output: "Google Gemini"

                // Assuming this.bots is an array of arrays, where each inner array is [id, _, name]
                // Create a map of bot IDs to names for quick lookup


                const botIdToName = this.bots;

                // Look up the name for the given botId
                // now we find names for bot ids in botIdToName array and use name if found, otherwise we use id
                const botNames = arrayOfModelIds.map(id => botIdToName.find(bot => bot.id === id)?.name || id);

                // If the bot name is found, return it; otherwise, return the original ID or a default message
                return botNames.join(', ');
            },



            generateCircularGaugeInHtml(percentage, hasDataHint = false, hintData, overrideColor = undefined) {
                const clampedPercentage = Math.max(0, Math.min(percentage, 1.00));
                const filledPercentage = this.decimalToStringWithExtraPrecisionOnlyIfNeeded(clampedPercentage * 100, 0);

                const radius = 18;
                const circumference = 2 * Math.PI * radius;
                const offset = circumference - (clampedPercentage * circumference);
                const strokeColor = overrideColor || 'var(--secondary-color)';

                return `
                  <div class="circular-gauge ${hasDataHint ? 'has-data-hint' : ''}"
                    ${hasDataHint ? `data-title="${hintData.title}" data-hint="${hintData.hint}"` : ''}>
                    <svg width="46" height="46">
                      <circle class="circular-gauge-bg" cx="23" cy="23" r="${radius}"></circle>
                      <circle class="circular-gauge-fill" cx="23" cy="23" r="${radius}"
                        style="stroke-dasharray: ${circumference}; stroke-dashoffset: ${offset}; stroke: ${strokeColor};"></circle>
                    </svg>
                    <span class="circular-gauge-text">${filledPercentage}%</span>
                  </div>
                `;
            },

            generateCompactGaugeInHtml(percentage, hasDataHint = false, hintData, overrideColor = undefined, rawValue = null) {
                const clampedPercentage = Math.max(0, Math.min(percentage, 1.00));
                const filledPercentage = this.decimalToStringWithExtraPrecisionOnlyIfNeeded(clampedPercentage * 100, 0);
                const barColor = overrideColor || 'rgb(59, 130, 246)'; // blue-500

                // Show raw value if provided, otherwise show percentage
                const displayText = rawValue !== null
                    ? `${rawValue} <span class="text-xs text-gray-500">(${filledPercentage}%)</span>`
                    : `${filledPercentage}%`;

                return `
                  <div class="inline-flex flex-col items-center ${hasDataHint ? 'has-data-hint' : ''}"
                    ${hasDataHint ? `data-title="${hintData.title}" data-hint="${hintData.hint}"` : ''}>
                    <span class="text-sm font-semibold">${displayText}</span>
                    <div class="mt-0.5 w-12 bg-gray-200 dark:bg-gray-700 rounded-full h-1">
                      <div class="h-1 rounded-full" style="width: ${filledPercentage}%; background-color: ${barColor};"></div>
                    </div>
                  </div>
                `;
            },

            generatePercentageIndicatorInHtml(percentage, hasDataHint = false, hintData, overrideColor = undefined, showRawValue = false, rawValue = null, useGrayBackground = false) {
                // Route to appropriate gauge type if not showing raw value
                if (!showRawValue) {
                    if (GAUGE_TYPE === 'circular') {
                        return this.generateCircularGaugeInHtml(percentage, hasDataHint, hintData, overrideColor);
                    } else if (GAUGE_TYPE === 'compact') {
                        return this.generateCompactGaugeInHtml(percentage, hasDataHint, hintData, overrideColor);
                    }
                }

                // Original bar gauge implementation (GAUGE_TYPE === 'bar' or showRawValue)
                const clampedPercentage = Math.max(0, Math.min(percentage, 1.00));
                const filledPercentage = this.decimalToStringWithExtraPrecisionOnlyIfNeeded(clampedPercentage * 100, 0);

                // If showing raw value with percentage, format as "8 (14%)" - text only mode
                if (showRawValue && !useGrayBackground && rawValue !== null) {
                    const displayText = `${rawValue} (${filledPercentage}%)`;
                    const gaugeHtml = `
                      <div class="gauge-container inline-flex items-center">
                        <span class="gauge-value font-medium ${hasDataHint ? 'has-data-hint' : ''}"
                          ${hasDataHint ? `data-title="${hintData.title}" data-hint="${hintData.hint}"` : ''}
                        >${displayText}</span>
                      </div>
                    `;
                    return gaugeHtml;
                }

                // Determine the text to display inside the gauge
                let gaugeText = `${filledPercentage}%`;
                if (rawValue !== null) {
                    // Show both raw value and percentage inside gauge
                    gaugeText = `${rawValue} (${filledPercentage}%)`;
                }

                // Apply light blue background if requested
                const backgroundClass = useGrayBackground ? 'gauge-background gauge-background-light-blue' : 'gauge-background';

                // Visual gauge HTML with optional raw value display
                const gaugeHtml = `
                  <div class="gauge-container">
                    <div class="${backgroundClass} relative w-20 h-5 rounded overflow-hidden">
                      <div class="gauge-fill h-full absolute left-0 top-0" style="width: ${filledPercentage}%;"></div>

                      <div class="gauge-fill h-full absolute left-0 top-0"
                        style="width: ${filledPercentage}%;${overrideColor ? ` background-color: ${overrideColor};` : ''}"
                      ></div>
                      <div class="gauge-text absolute inset-0 flex items-center justify-center text-xs font-semibold ${hasDataHint ? 'has-data-hint' : ''}"
                        ${hasDataHint ? `data-title="${hintData.title}" data-hint="${hintData.hint}"` : ''}
                      >${gaugeText}</div>
                    </div>
                  </div>
                `;
                return gaugeHtml;
            },


            setDefaultSortingIcon(table) {
                // Add sort icons to the headers if they don't exist
                if (!table) return; // Add null check for table
                const thead = table.querySelector('thead');
                if (!thead) return; // Add null check for thead
                thead.querySelectorAll('th[data-sort]').forEach(th => {
                    if (!th.querySelector('.sort-icon')) {
                        const icon = document.createElement('span');
                        icon.className = 'sort-icon opacity-30';
                        icon.textContent = '\u25B2'; // Up arrow
                        th.appendChild(icon);
                    }
                });
            },


            getTrendSymbol(trend) {
                switch (Number(trend)) {
                    case TRENDS.UP: return "↑";
                    case TRENDS.DOWN: return "↓";
                    case TRENDS.STABLE: return "→";
                    case TRENDS.NEW: return "★";// "*"; // "•";
                    case TRENDS.DISAPPEARED: return "✖";//"x";
                    case TRENDS.FLUCTUATING: return "⇅"; //"↔";
                    case TRENDS.UNKNOWN: return "⚬"; // Vertically centered dot (bullet point)
                    default: return "∅";
                }
            },

            isEntitySelected(entityValue) {
                // Check if an entity is in the selectedItems array
                return this.selectedItems.some(brand => brand.value === entityValue);
            },

            getHighlightClass(entityValue) {
                // Return highlight class if entity is selected
                return this.isEntitySelected(entityValue) ? 'brand-highlight' : '';
            },

            getHighlightStyle(entityValue) {
                // Return inline style for highlighting if entity is selected
                if (this.isEntitySelected(entityValue)) {
                    // Use different colors for light and dark mode
                    const isDarkMode = document.documentElement.classList.contains('dark');
                    return isDarkMode ? 'background-color: #451a03 !important;' : 'background-color: #fef3c7 !important;';
                }
                return '';
            },

            darkenColor(color, factor) {
                // Convert hex to RGB
                const hex = color.replace('#', '');
                const r = parseInt(hex.substring(0, 2), 16);
                const g = parseInt(hex.substring(2, 4), 16);
                const b = parseInt(hex.substring(4, 6), 16);

                // Darken by factor
                const newR = Math.round(r * (1 - factor));
                const newG = Math.round(g * (1 - factor));
                const newB = Math.round(b * (1 - factor));

                // Convert back to hex
                return '#' + [newR, newG, newB].map(x => {
                    const hex = x.toString(16);
                    return hex.length === 1 ? '0' + hex : hex;
                }).join('');
            },

            init_table(obj) {
                const tableElement = document.getElementById(obj.id);
                if (!tableElement) {
                    throw new Error(`Table element not found: ${obj.id}`);
                }

                console.debug(`DEBUG init_table: ${obj.id}, ${obj.sourceArrayName}: ${this[`${obj.sourceArrayName}`]?.length}, filtered_${obj.id}.length: ${this[`filtered_${obj.id}`]?.length}`);

                this.initUniversalTable({
                    containerId: obj.id,
                    filteredItems: this[`filtered_${obj.id}`],
                    selectedAIEngine: this[`selected_${obj.id}_AIModels`],
                    selectedTrend: this[`selected_${obj.id}_Trend`],
                    columns: obj.columns
                });

                // Reinitialize sorting for this table after it's been rebuilt
                this.$nextTick(() => {
                    const table = document.getElementById(obj.id);
                    if (table && table.classList.contains('sortable-table')) {
                        table.querySelectorAll('th[data-sort]').forEach(th => {
                            // Remove any existing click listeners to avoid duplicates
                            const newTh = th.cloneNode(true);
                            th.parentNode.replaceChild(newTh, th);
                            // Add new click listener
                            newTh.addEventListener('click', () => {
                                const column = newTh.getAttribute('data-sort');
                                this.sortTable(obj.id, column);
                            });
                        });
                    }
                });
            },

            expand_table(obj) {
                this[`current_visible_items_count_${obj.id}`] = Math.min(this[`current_visible_items_count_${obj.id}`] + 10, this[`filtered_${obj.id}`].length);
                this.init_table(obj);
            },


            initZoomBehavior(svg, g, width, height) {
                const zoom = d3.zoom()
                    .scaleExtent([0.1, 4])
                    .filter(event => {
                        // Allow all events except wheel/deltaY (mouse scroll)
                        return event.type !== 'wheel';
                    })
                    .on("zoom", (event) => {
                        g.attr("transform", event.transform);
                    });

                svg.call(zoom);

                // Initial zoom to fit
                const bounds = g.node().getBBox();
                const scale = 0.95 / Math.max(bounds.width / width, bounds.height / height);
                const transform = d3.zoomIdentity
                    .translate(width / 2 - bounds.x * scale - bounds.width * scale / 2,
                        height / 2 - bounds.y * scale - bounds.height * scale / 2)
                    .scale(scale);

                svg.call(zoom.transform, transform);
            },

            // forming methods like `expand_organizations_button` for each table
            ...get_DEFAULT_VISUAL_OBJECTS_ARRAY().filter(obj => obj.type === 'table-with-items').reduce((acc, obj) => ({
                ...acc,
                [`button_expand_${obj.id}`]() {
                    this[`current_visible_items_count_${obj.id}`] = Math.min(
                        this[`current_visible_items_count_${obj.id}`] + 10,
                        this[`filtered_${obj.id}`].length
                    );
                    this.init_table(obj);
                }
            }), {}),


            handleTableCheckboxChange(event) {
                const storageKey = event.target.getAttribute('data-storage-key');
                const checkedValue = event.target.checked ? 1 : 0;
                // save attribute to checkbox itself
                // get parent cell
                const parentCell = event.target.closest('td');
                // save parent cell data-value that we can export and use for sort
                parentCell.setAttribute('data-value', checkedValue);
                // save to local storage too
                localStorage.setItem(storageKey, checkedValue);
            },

            initUniversalTable({
                containerId,              // HTML element ID for the table
                filteredItems,               // Filtered array of items
                selectedAIEngine,            // Selected AI engine
                selectedTrend,               // Selected trend
                columns              // Array of column identifiers to show
            }) {

                // Handle array inputs for selectedAIEngine
                if (Array.isArray(selectedAIEngine)) {
                    if (selectedAIEngine.length === 0 || selectedAIEngine.length === this.bots.length) {
                        // If no models selected or all models selected, use ALL_MODELS
                        selectedAIEngine = this.ALL_MODELS_OPTION_CAPTION || 'All';
                    } else if (selectedAIEngine.length === 1) {
                        // If only one model selected, use that model
                        selectedAIEngine = selectedAIEngine[0];
                    } else {
                        // Multiple models selected (but not all) - treat as all for now
                        selectedAIEngine = this.ALL_MODELS_OPTION_CAPTION || 'All';
                    }
                }

                if (!filteredItems) {
                    throw new Error(`No filteredItems found for table: ${containerId}`);
                }

                const table = document.getElementById(containerId);

                if (!table) {
                    throw new Error(`Table element not found: ${containerId}`);
                }

                // Ensure table has headers - important for CSV export and sorting
                let thead = table.querySelector('thead');
                if (!thead || thead.rows.length === 0) {
                    // Create headers if they don't exist
                    thead = thead || table.createTHead();
                    const headerRow = thead.insertRow();
                    columns.forEach(column => {
                        const th = document.createElement('th');
                        th.className = 'px-3 py-2 text-left cursor-pointer font-semibold report-table__header';
                        th.setAttribute('data-sort', column.type);
                        th.textContent = column.caption;
                        headerRow.appendChild(th);
                    });
                }

                const tbody = table.querySelector('tbody') || table.createTBody();
                tbody.innerHTML = '';

                if (IS_DEBUG) {
                    console.debug(`DEBUG filteredItems for (${containerId}): ${JSON.stringify(filteredItems, null, 2)}`);
                }

                if (this[`current_visible_items_count_${containerId}`] > filteredItems.length) {
                    this[`current_visible_items_count_${containerId}`] = filteredItems.length;
                }
                else if (this[`current_visible_items_count_${containerId}`] < VISIBLE_COUNT_BY_DEFAULT_HARD_MIN_LIMIT) {
                    this[`current_visible_items_count_${containerId}`] = this.get_default_max_visible_item_count(filteredItems.length);
                }

                if (filteredItems.length != this[`total_count_${containerId}`]) {
                    this[`current_filtered_count_${containerId}`] = filteredItems.length;
                }
                else {
                    // set to -1 if all items are shown
                    this[`current_filtered_count_${containerId}`] = -1;
                    //this[`current_visible_items_count_${containerId}`] = this.get_default_max_visible_item_count(this[`total_count_${containerId}`]);

                }

                let rowCount = 0;

                filteredItems.slice(0, this[`current_visible_items_count_${containerId}`]).forEach(el => {
                    const row = tbody.insertRow();
                    row.className = '';
                    rowCount++;

                    // Add data attributes for clickable summary navigation
                    const entityType = containerId.replace('table_', '').replace('linkTypes', 'linkType');
                    const entityValue = el.value || el.name || el.code || '';
                    if (entityType && entityValue) {
                        row.setAttribute('data-entity-type', entityType);
                        row.setAttribute('data-entity-value', entityValue.toLowerCase().trim());
                        row.setAttribute('data-entity-original', entityValue.trim());
                    }


                    let columnCount = 0;
                    // Add columns based on columns array
                    columns.forEach(column => {
                        switch (column.type) {
                            case 'marked':
                                this.addMarkedCell(row, el, containerId);
                                columnCount++;
                                break;
                            case 'appearanceOrder':
                                this.addAppearanceOrderCell(containerId, row, el, selectedAIEngine);
                                columnCount++;
                                break;
                            case 'mentions':
                                this.addMentionsCell(containerId, row, el, selectedAIEngine);
                                columnCount++;
                                break;
                            case 'modelNames':
                                this.addUniqueModelNamesCell(containerId, row, el, selectedAIEngine);
                                columnCount++;
                                break;
                            case 'link':
                                this.addLinkCell(row, el);
                                columnCount++;
                                break;
                            case 'influence':
                            case 'positive':
                            case 'neutral':
                            case 'negative':
                                this.addGaugeCell(containerId, row, el, column, selectedAIEngine);
                                columnCount++;
                                break;
                            case 'value':
                            case 'sentiment':
                            case 'name':
                            case 'organization':
                            case 'linkType':
                            case 'linkTypeName':
                            case 'bots':
                            case 'similar':
                                this.addValueCell(containerId, row, el, column);
                                columnCount++;
                                break;

                            default:
                                throw new Error(`unknown column type: ${column.type}`);
                                break;
                        }
                    });
                    console.debug(`table ${containerId}, row ${rowCount} has ${columnCount} columns`);

                });
                console.debug(`table ${containerId}, row ${rowCount} generated`);


                this.setDefaultSortingIcon(table);
                this.updateShowMoreButtons();

                // After table is populated, set up intersection observer for scroll hint
                this.$nextTick(() => {
                    const containerEl = document.querySelector(`#${containerId}`);
                    if (!containerEl) return; // Skip if container doesn't exist
                    const tableWrapper = containerEl.closest('.overflow-x-auto');
                    if (tableWrapper && window.innerWidth <= 2000)  // for all devices
                    {
                        // Create intersection observer
                        const observer = new IntersectionObserver((entries) => {
                            entries.forEach(entry => {

                                if (entry.isIntersecting &&
                                    !tableWrapper.dataset.animationPlayed &&
                                    !this.$root.isWelcomeModalVisible) {
                                    // Add CSS class for animation
                                    tableWrapper.classList.add('scroll-hint');

                                    // Remove the animation class after it plays once
                                    setTimeout(() => {
                                        tableWrapper.classList.remove('scroll-hint');
                                    }, 2500); // Animation duration + small delay

                                    // Mark animation as played
                                    tableWrapper.dataset.animationPlayed = 'true';

                                    // Disconnect observer after playing animation
                                    observer.disconnect();
                                }
                            });
                        }, {
                            threshold: 0.2 // Trigger when 20% of the element is visible
                        });

                        // Start observing the table wrapper
                        observer.observe(tableWrapper);
                    }
                });

            },

            addMarkedCell(row, el, containerId) {
                // Checkbox Cell
                const checkboxCell = row.insertCell();
                checkboxCell.setAttribute('data-column', 'marked');
                checkboxCell.className = 'px-4 py-2 whitespace-nowrap report-table__cell';

                // Create flex container for vertical centering
                const flexContainer = document.createElement('div');
                flexContainer.className = 'flex items-center gap-0.5';

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'form-checkbox h-5 w-5 text-blue-600';
                const storageKey = `${containerId}_${el.value}`;
                checkbox.setAttribute('data-storage-key', storageKey);

                const isChecked = localStorage.getItem(storageKey);
                checkbox.checked = isChecked;
                checkboxCell.setAttribute('data-value', isChecked ? 1 : 0);
                checkbox.addEventListener('change', this.handleTableCheckboxChange);

                flexContainer.appendChild(checkbox);
                checkboxCell.appendChild(flexContainer);
            },

            // Helper functions for adding specific cell types
            // Helper functions for adding specific cell types
            addAppearanceOrderCell(parentContainerId, row, el, selectedEngine) {
                const currentModel = (!selectedEngine || selectedEngine === this.ALL_MODELS_OPTION_CAPTION) ? null : selectedEngine;
                const currentAppearanceOrder = (!selectedEngine || selectedEngine === this.ALL_MODELS_OPTION_CAPTION)
                    ? el.appearanceOrder
                    : el.appearanceOrderByModel[selectedEngine] || NA_VALUE_CAPTION;

                const appearanceOrderCell = row.insertCell();
                // Round the display value but keep precise value for sorting and tooltips
                const appearanceOrderVal = currentModel ? currentAppearanceOrder : currentAppearanceOrder;
                const appearanceOrderDisplay = appearanceOrderVal > -1 ? Math.round(appearanceOrderVal) : -1;
                const appearanceOrderString = appearanceOrderDisplay > -1 ? appearanceOrderDisplay : NA_VALUE_HTML_FOR_CELL;
                appearanceOrderCell.className = 'px-4 py-2 whitespace-nowrap report-table__cell';
                appearanceOrderCell.innerHTML = `<div class="icon-grid">` +

                    `${this.getTrendSymbolAsHtml(parentContainerId, el, 'appearanceOrder', currentModel)}` +

                    `${appearanceOrderString}
                    </div>`;
                appearanceOrderCell.setAttribute('data-column', 'appearanceOrder');
                appearanceOrderCell.setAttribute('data-value', appearanceOrderVal); // Keep precise value for sorting
            },

            addMentionsCell(parentContainerId, row, el, selectedEngine) {
                const currentModel = (!selectedEngine || selectedEngine === this.ALL_MODELS_OPTION_CAPTION) ? null : selectedEngine;
                const currentMentions = (!selectedEngine || selectedEngine === this.ALL_MODELS_OPTION_CAPTION)
                    ? el.mentions
                    : el.mentionsByModel[selectedEngine] || ERROR_VALUE;

                const currentMentionsAsPercent = (!selectedEngine || selectedEngine === this.ALL_MODELS_OPTION_CAPTION)
                    ? el.mentionsAsPercent
                    : el.mentionsAsPercentByModel[selectedEngine] || ERROR_VALUE;

                const mentionsCell = row.insertCell();
                mentionsCell.className = 'px-4 py-2 whitespace-nowrap report-table__cell';

                // Generate hint data for mentions
                const hintData = this.generateHintData(parentContainerId, currentModel, el, 'mentions');

                // Create content with trend symbol and text format like "14 (10%)"
                let cellContent = `<div class="flex items-center gap-0.5">`;

                cellContent += this.getTrendSymbolAsHtml(parentContainerId, el, 'mentions', currentModel);


                if (currentMentions > 0 && currentMentionsAsPercent > -1) {
                    // Use compact gauge with raw value
                    cellContent += this.generateCompactGaugeInHtml(
                        currentMentionsAsPercent,
                        true,
                        hintData,
                        'rgb(59, 130, 246)', // blue-500
                        currentMentions
                    );
                } else {
                    cellContent += NA_VALUE_HTML_FOR_CELL;
                }

                cellContent += `</div>`;

                mentionsCell.innerHTML = cellContent;
                mentionsCell.setAttribute('data-column', 'mentions');
                mentionsCell.setAttribute('data-value', currentMentions);
            },

            addUniqueModelNamesCell(parentContainerId, row, el, selectedEngine) {

                const currentModel = (!selectedEngine || selectedEngine === this.ALL_MODELS_OPTION_CAPTION) ? null : selectedEngine;

                const uniqueCount = el.uniqueModelCount || el.botCount || 0;
                const cell = row.insertCell();
                cell.className = 'px-4 py-2 whitespace-nowrap report-table__cell';

                // Get model icons without contraction (last parameter is false by default)
                const modelIconsHtml = this.getModelIconsWithHintsAsHtml(parentContainerId, el, 'modelCount', currentModel, false);

                // Add trend symbol if available
                const trendHtml = el.modelCountTrend !== undefined ?
                    this.getTrendSymbolAsHtml(parentContainerId, el, 'modelCount', null) : '';

                cell.innerHTML = `
                    <div class="icon-grid">
                        ${trendHtml}                        
                        ${modelIconsHtml}
                    </div>
                `;
                    
                cell.setAttribute('data-column', 'modelNames');
                cell.setAttribute('data-value', uniqueCount);
            },

            addLinkCell(row, el) {
                const linkCell = row.insertCell();
                linkCell.setAttribute('data-column', 'link');
                linkCell.className = 'px-4 py-2 w-full min-w-0 whitespace-nowrap report-table__cell';

                // Check if link exists and is not undefined
                if (!el.link || el.link === 'undefined') {
                    // No link available - show empty cell
                    linkCell.textContent = '';
                    return;
                }

                // Check if this link is AI-generated
                const isAIGenerated = el.sources && el.sources.link === "AI";
                const contentSuffix = isAIGenerated ? "<small>✨</small>" : "";

                // Check if excerpts are available
                const hasExcerpts = el.excerptsByModel && Object.keys(el.excerptsByModel).some(modelId => el.excerptsByModel[modelId] && el.excerptsByModel[modelId].length > 0);

                if (hasExcerpts) {
                    // Create a container for link and preview button
                    linkCell.innerHTML = `
                        <div class="flex items-center gap-2">
                            <a href="${this.makeClickableUrl(el.link)}"
                               target="_blank"
                               rel="noopener noreferrer"
                               class="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline truncate">
                                ${this.truncateString(this.cleanAndMinimizeUrl(this.makeClickableUrl(el.link)))}
                            </a>${contentSuffix}
                            <button
                                class="preview-icon-btn group"
                                title="View context from AI models"
                                onclick="window.app.showExcerptPopup(${JSON.stringify(el).replace(/"/g, '&quot;')}, 'link')"
                            >
                                <i class="fas fa-search group-hover-visible"></i>
                            </button>
                        </div>
                    `;
                } else {
                    // Original implementation without preview button
                    const linkElement = document.createElement('a');
                    const formattedLink = this.cleanAndMinimizeUrl(this.makeClickableUrl(el.link));
                    linkElement.href = this.makeClickableUrl(el.link);
                    linkElement.textContent = this.truncateString(formattedLink) + contentSuffix;
                    linkElement.target = '_blank';
                    linkElement.rel = 'noopener noreferrer';
                    linkElement.className = 'text-blue-600 hover:text-blue-800 hover:underline block truncate';

                    linkCell.appendChild(linkElement);
                }
            },


            addGaugeCell(parentContainerId, row, el, column, selectedEngine) {

                const currentModel = (!selectedEngine || selectedEngine === this.ALL_MODELS_OPTION_CAPTION) ? this.ALL_MODELS_OPTION_CAPTION : selectedEngine;
                const val = (!selectedEngine || selectedEngine === this.ALL_MODELS_OPTION_CAPTION)
                    ? el[column.type]
                    : el[column.type + 'ByModel'][selectedEngine] || ERROR_VALUE;

                const hintData = this.generateHintData(parentContainerId, currentModel, el, column.type);

                const valCell = row.insertCell();
                valCell.className = 'px-4 py-2 whitespace-nowrap report-table__cell';

                // Wrap content in flex container with trend symbol, similar to mentions column
                let cellContent = `<div class="flex items-center gap-0.5">`;

                cellContent += this.getTrendSymbolAsHtml(parentContainerId, el, column.type, currentModel);

                cellContent += this.generatePercentageIndicatorInHtml(val, true, hintData, column.overrideColor);
                cellContent += `</div>`;

                valCell.innerHTML = cellContent;
                // data column and value
                valCell.setAttribute('data-column', column.type);
                valCell.setAttribute('data-value', val);

            },

            addValueCell(parentContainerId, row, el, column) {
                const valueCell = row.insertCell();
                let val = el[column.type];
                if (val === undefined) {
                    val = '';
                    console.warn(`${column.type} is undefined for ${el.value} in ${parentContainerId}, replaced with empty string`);
                }

                // Convert linkType code to full name
                if (column.type === 'linkType' && val) {
                    val = this.getLinkTypeName(val);
                }

                valueCell.setAttribute('data-column', column.type);
                valueCell.className = 'px-4 py-2 whitespace-nowrap selectable-text';

                // Add highlighting if this is a value column and the entity is selected
                if (column.type === 'value' && this.isEntitySelected(el.value)) {
                    val = `<span class="${this.getHighlightClass(el.value)}">${val}</span>`;
                }

                // Add v-select-text directive attribute
                valueCell.setAttribute('v-select-text', '');

                // Add aggregate report tooltip if applicable
                let aggregateTooltip = '';
                if (this.isAggregateReport && column.type === 'value' && el.mentionsByPrompt) {
                    const promptBreakdown = this.getPromptBreakdownTooltip(el);
                    if (promptBreakdown) {
                        aggregateTooltip = `title="${promptBreakdown.replace(/"/g, '&quot;')}"`;
                    }
                }

                if (this.checkIfStringIsUrl(val)) {
                    valueCell.innerHTML = `
                    <a class="px-4 py-2 whitespace-nowrap min-w-0 block truncate selectable-text" 
                    href="${val}" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    v-select-text
                    ${aggregateTooltip}
                    >${val}</a>`;
                } else {
                    let addSearchButton = true;
                    if (column?.subType == 'botId') {
                        val = this.getModelNameById(val, parentContainerId)
                        // do not add search button for this value
                        addSearchButton = false;
                    }
                    if (val === undefined || val.length === 0) {
                        addSearchButton = false;
                    }
                    const isCommaSeparated = column?.subType2 == 'commaSeparated';
                    const sValues = isCommaSeparated ? val.split(',').map(v => v.trim()) : [val];

                    // Add excerpt button if available
                    const hasExcerpts = el.excerptsByModel && Object.keys(el.excerptsByModel).some(modelId => el.excerptsByModel[modelId] && el.excerptsByModel[modelId].length > 0);

                    // Check if this field is AI-generated
                    const isAIGenerated = el.sources && el.sources[column.type] === "AI";
                    const contentSuffix = isAIGenerated ? "<small>✨</small>" : "";                    
                    const addPreviewExcerpt = hasExcerpts && (COLUMNS_WITH_PREVIEW_EXCERPT.includes(column.type));

                    valueCell.innerHTML = `
                    <div class="flex items-center gap-2 px-4 py-2" ${aggregateTooltip}>
                        ${sValues.map(v => `
                            <span class="inline-flex items-center gap-1 group">
                                <span class="selectable-text" v-select-text>${v}</span>${contentSuffix}
                                ${addPreviewExcerpt ? `<button
                                    class="preview-icon-btn group-hover-visible"
                                    title="View context from AI models"
                                    onclick="window.app.showExcerptPopup(${JSON.stringify(el).replace(/"/g, '&quot;')}, '${column.type}')"
                                    ><i class="fas fa-search"></i
                                ></button>` : ''}
                            </span>
                        `).join(',')}
                    </div>`;
                }
            },


            createNodeShape(selection) {
                // 'this' is now the Vue component instance passed via .call()
                const self = this; // This now correctly refers to the Vue component
                selection.each(function (d) {
                    const element = d3.select(this);

                    // Clear existing content
                    element.selectAll("*").remove();

                    const currentRadius = d.r || 10;

                    let createdNodeShape = null;
                    let nodeHintTitle = null;
                    let nodeHintValue = null;

                    if (d.group === 2) { // Model nodes
                        // Muting logic
                        let isMutedIcon = !(d.selectedAIEngine === self.ALL_MODELS_OPTION_CAPTION);
                        if (isMutedIcon) {
                            isMutedIcon = !(d.selectedAIEngine === d.id);
                        }

                        const botClass = self.getModelIconClassName(d.id, isMutedIcon);
                        nodeHintTitle = self.getModelNameById(d.id);
                        const botItemCount = self[`${d.containerId}_item_count_by_bot`].find(i => i.id === d.id)?.count;
                        nodeHintValue = `${botItemCount} item(s)`;
                        const botIconUrl = self.getModelIconUrl(d.id);

                        const engineName = self.getModelNameById(d.id);

                        // Create bot node container
                        createdNodeShape = element.append("rect")
                            .attr("data-title", nodeHintTitle)
                            .attr("data-hint", nodeHintValue)
                            .attr("width", currentRadius * 2)
                            .attr("height", currentRadius * 2)
                            .attr("x", -currentRadius)
                            .attr("y", -currentRadius)
                            .attr("rx", GRAPH_BOT_CORNER_RADIUS)
                            .attr("ry", GRAPH_BOT_CORNER_RADIUS)
                            .attr("class", `${GRAPH_BOT_CLASSES} ${botClass}`);

                        // Create a group for the icon/text
                        const iconGroup = element.append("g")
                            .attr("class", "bot-icon-container")
                            .attr("data-title", nodeHintTitle)
                            .attr("data-hint", nodeHintValue);

                        // Add background rectangle for icon (dark mode aware)
                        const isDarkMode = document.documentElement.classList.contains('dark');
                        const iconBackgroundSize = currentRadius * 1.6; // Slightly larger than the icon
                        const iconBackground = iconGroup.append("rect")
                            .attr("width", iconBackgroundSize)
                            .attr("height", iconBackgroundSize)
                            .attr("x", -iconBackgroundSize / 2)
                            .attr("y", -iconBackgroundSize / 2)
                            .attr("rx", 4) // Rounded corners
                            .attr("ry", 4)
                            .attr("fill", isDarkMode ? "#374151" : "#f0f0f0")
                            .attr("stroke", isDarkMode ? "#4b5563" : "#e0e0e0")
                            .attr("stroke-width", 1)
                            .style("filter", "drop-shadow(1px 1px 2px rgba(0,0,0,0.1))");

                        if (botIconUrl) {
                            // Add bot icon image
                            const iconSize = currentRadius * 1.4;
                            iconGroup.append("image")
                                .attr("xlink:href", botIconUrl)
                                .attr("width", iconSize)
                                .attr("height", iconSize)
                                .attr("x", -iconSize / 2)
                                .attr("y", -iconSize / 2)
                                .attr("class", botClass)
                                .style("opacity", isMutedIcon ? 0.5 : 1)
                                .attr("preserveAspectRatio", "xMidYMid meet")
                                .on("error", function () {
                                    // On error, remove the image and switch to text approach
                                    d3.select(this).remove();
                                    addTextIcon();
                                });
                        } else {
                            // Use text approach if no icon URL
                            addTextIcon();
                        }

                        // Update the addTextIcon function to work with the background
                        function addTextIcon() {
                            iconGroup.append("text")
                                .attr("class", botClass)
                                .attr("text-anchor", "middle")
                                .attr("dominant-baseline", "central")
                                .attr("x", 0)
                                .attr("y", 0)
                                .style("font-size", `${currentRadius * 0.8}px`)
                                .style("fill", document.documentElement.classList.contains('dark') ? "#e5e7eb" : "#666666") // Adaptive text color
                                .text(engineName.charAt(0).toUpperCase());
                        }


                        // Update the iconGroup hover behavior
                        iconGroup
                            .on("mouseover touchstart", function (event) {
                                //event.stopPropagation();
                                const node = d3.select(this.parentNode);
                                node.raise();

                                // Enhanced highlight effect with shadow and white glow
                                iconBackground
                                    .transition()
                                    .duration(200)
                                    .attr("fill", isDarkMode ? "#1f2937" : "#ffffff") // Dark mode aware background
                                    .attr("stroke", isDarkMode ? "#9ca3af" : "#666666") // Dark mode aware border
                                    .attr("stroke-width", 2)
                                    .style("filter", "drop-shadow(2px 2px 4px rgba(0,0,0,0.3)) brightness(1.1)") // Deeper shadow and slight brightness boost
                                    .style("cursor", "pointer");

                                if (!self.isTouchDevice) {
                                    self.showDataHint(event, {
                                        title: nodeHintTitle,
                                        hint: nodeHintValue,
                                        element: this
                                    });
                                }
                            })
                            .on("mouseout touchend", function (event) {
                                const toElement = event.relatedTarget;
                                const node = d3.select(this.closest('g'));

                                if (!node.node().contains(toElement)) {
                                    // Smooth transition back to normal state
                                    iconBackground
                                        .transition()
                                        .duration(300)
                                        .attr("fill", isDarkMode ? "#374151" : "#f0f0f0")
                                        .attr("stroke", isDarkMode ? "#4b5563" : "#e0e0e0")
                                        .attr("stroke-width", 1)
                                        .style("filter", "drop-shadow(1px 1px 2px rgba(0,0,0,0.1))")
                                        .style("cursor", "default");

                                    if (!self.isTouchDevice) {
                                        self.removeDataHint(event);
                                    }
                                }
                            })
                            .on("click", function (event) {
                                event.stopPropagation();
                                if (self.isTouchDevice) {
                                    self.showDataHint(event, {
                                        title: nodeHintTitle,
                                        hint: nodeHintValue,
                                        element: this
                                    });
                                }
                            });


                        // Update the createdNodeShape event handlers for bot nodes
                        createdNodeShape
                            .on("mouseover touchstart", function (event) {
                                const node = d3.select(this.parentNode);
                                node.raise();

                                if (!self.isTouchDevice) {
                                    self.showDataHint(event, {
                                        title: nodeHintTitle,
                                        hint: nodeHintValue,
                                        element: event.target
                                    });
                                }
                            })
                            .on("mouseout touchend", function (event) {
                                const toElement = event.relatedTarget;
                                const node = d3.select(this.parentNode);

                                if (!node.node().contains(toElement) && !self.isTouchDevice) {
                                    self.removeDataHint(event);
                                }
                            })
                            .on("click", function (event) {
                                event.stopPropagation();
                                if (self.isTouchDevice) {
                                    self.showDataHint(event, {
                                        title: nodeHintTitle,
                                        hint: nodeHintValue,
                                        element: event.target
                                    });
                                }
                            });
                    } else { // Regular nodes


                        // find originalItem
                        const originalItemsAll = self[d.sourceArrayName];
                        if (!originalItemsAll) {
                            throw new Error(`Cannot find original array: ${d.type}`)
                        }
                        const item = originalItemsAll.find(i => i.value === d.id);

                        //const hintDataAppearanceOrder = self.generateHintData(d.containerId, d.selectedAIEngine, item, 'appearanceOrder', true);
                        const hintDataMentions = self.generateHintData(d.containerId, d.selectedAIEngine, item, 'mentions', false);
                        //const hintDataInfluence = self.generateHintData(d.containerId, d.selectedAIEngine, item, 'influence', true);

                        nodeHintTitle = self.truncateString(d.id);
                        nodeHintValue = `${hintDataMentions.title}\n${hintDataMentions.hint}`;

                        createdNodeShape = element.append("circle")
                            .attr("data-title", nodeHintTitle)
                            .attr("data-hint", nodeHintValue)
                            .attr("r", currentRadius)
                            // Use the color from node data directly (set by getColorFromStringAndInfluence)
                            .attr("fill", d => {
                                // Check if entity is selected
                                const isSelected = self.isEntitySelected(d.id);
                                if (isSelected) {
                                    return "#fef3c7"; // Highlight color for selected entities
                                }
                                // Use the color calculated from influence
                                return d.color || "#cccccc";
                            })
                            .attr("stroke", "#ffffff")
                            .attr("stroke-width", 2)
                            .attr("filter", "drop-shadow(2px 2px 4px rgba(0,0,0,0.2))")
                            .attr("class", "has-data-hint node-circle");

                        const textGroup = element.append("g")
                            .attr("data-title", nodeHintTitle)
                            .attr("data-hint", nodeHintValue)
                            .attr("text-anchor", "middle")
                            .attr("dominant-baseline", "central");

                        if (item) {
                            // Get trend symbol
                            let appearanceOrderTrend = TRENDS.UNKNOWN;
                            if (d.selectedAIEngine === self.ALL_MODELS_OPTION_CAPTION) {
                                appearanceOrderTrend = item.appearanceOrderTrend;
                            } else {
                                appearanceOrderTrend = item.appearanceOrderByModelTrend[d.selectedAIEngine];
                            }

                            // Calculate text size based on word length and node size
                            let word = d.id;
                            if (item.link && item.link == d.id) {
                                word = self.extractDomain(d.id);
                            }
                            const trendSymbol = self.getTrendSymbol(appearanceOrderTrend);
                            const fullText = word + ' ' + trendSymbol;

                            // Improved text sizing calculation with better trend symbol consideration
                            const padding = 0.85; // Reduced padding to prevent overflow
                            const estimatedCharWidth = 0.6; // Increased for better character spacing
                            const textLength = fullText.length;
                            const diameter = currentRadius * 2;
                            const availableWidth = diameter * padding;

                            // If there's a link, make it clickable
                            if (item.link && item.link.length > 0) {

                                // Account for trend symbol in size calculation
                                const fontSize = Math.min(
                                    availableWidth / (textLength * estimatedCharWidth),
                                    diameter * 0.35 // Reduced maximum height to 35% of diameter
                                );
                                const domain = self.extractDomain(item.link);

                                // Calculate favicon sizes
                                const baseIconSize = Math.min(currentRadius * 0.8, 32); // Default size based on node radius
                                const defaultFaviconSize = baseIconSize <= 16 ? 16 : baseIconSize <= 32 ? 32 : 64;
                                const hoverFaviconSize = 128; // Always use highest quality for hover state

                                // Create URLs for both states
                                const defaultFaviconUrl = FAVICON_32_TEMPLATE.replace('{{DOMAIN}}', domain);
                                const hoverFaviconUrl = FAVICON_128_TEMPLATE.replace('{{DOMAIN}}', domain);

                                // Create a group for the favicon and text
                                const contentGroup = textGroup.append("g")
                                    .attr("class", "node-content");

                                // Add favicon image container
                                const imageContainer = contentGroup.append("g")
                                    .attr("class", "favicon-container");

                                // Add two images - one for default state and one for hover
                                // Default state favicon
                                const defaultImage = imageContainer.append("image")
                                    .attr("class", "favicon default")
                                    .attr("xlink:href", defaultFaviconUrl)
                                    .attr("width", baseIconSize)
                                    .attr("height", baseIconSize)
                                    .attr("x", -baseIconSize / 2)
                                    .attr("y", -fontSize * 1.2)
                                    .attr("preserveAspectRatio", "xMidYMid meet")
                                    .style("opacity", 1);

                                // Hover state favicon (initially hidden)
                                const hoverImage = imageContainer.append("image")
                                    .attr("class", "favicon hover")
                                    .attr("xlink:href", hoverFaviconUrl)
                                    .attr("width", baseIconSize)
                                    .attr("height", baseIconSize)
                                    .attr("x", -baseIconSize / 2)
                                    .attr("y", -fontSize * 1.2)
                                    .attr("preserveAspectRatio", "xMidYMid meet")
                                    .style("opacity", 0);

                                // Create link element
                                const linkElement = contentGroup.append("a")
                                    .attr("xlink:href", self.makeClickableUrl(item.link))
                                    .attr("target", "_blank")
                                    .attr("rel", "noopener noreferrer")
                                    .attr("data-title", nodeHintTitle)
                                    .attr("data-hint", nodeHintValue);

                                // Add text element within link

                                const textElement = linkElement.append("text")
                                    .attr("x", 0)
                                    .attr("y", baseIconSize * 0.7) // Adjust text appearanceOrder based on icon size
                                    .style("font-size", `${fontSize}px`)
                                    .style("fill", "#ffffff")
                                    .style("font-family", "'Segoe UI', 'Arial', sans-serif")
                                    .style("paint-order", "stroke")
                                    .style("stroke", "rgba(0,0,0,0.3)")
                                    .style("stroke-width", "1px")
                                    .style("alignment-baseline", "middle");


                                // Add text content
                                textElement.html(() => {

                                    // Create tspan element with word and trend symbol on same line
                                    return `<tspan x="0" dy="0">${word} ${trendSymbol}</tspan>`;
                                })

                                // Adjust vertical appearanceOrdering of the entire text group
                                textGroup.attr('transform', function () {
                                    const numLines = Math.ceil(word.split(/\s+/).length / 2); // No extra line for trend symbol
                                    const totalHeight = numLines * fontSize * 1.2;
                                    return `translate(0,${-totalHeight / 2 + fontSize / 2})`;
                                });

                                // Event listeners for hover effects
                                linkElement
                                    .on("mouseover", function (event) {
                                        event.stopPropagation();
                                        if (!self.isTouchDevice) {
                                            self.showDataHint(event, {
                                                title: nodeHintTitle,
                                                hint: nodeHintValue,
                                                element: event.target
                                            });
                                        }
                                    })
                                    .on("mouseout", function (event) {
                                        const toElement = event.relatedTarget;
                                        const node = d3.select(this.closest('g'));

                                        if (!node.node().contains(toElement)) {
                                            if (!self.isTouchDevice) {
                                                self.removeDataHint(event);
                                            }
                                        }
                                    });

                                // Update the mouseover behavior for the node to handle favicon switching
                                createdNodeShape
                                    .on("mouseover", function (event, d) {
                                        const node = d3.select(this.parentNode);
                                        node.raise();

                                        if (d.group !== 2) {
                                            const currentDiameter = (d.r || 10) * 2;
                                            const scaleFactor = 2.0;

                                            // Switch to high-res favicon
                                            node.select(".favicon.default").style("opacity", 0);
                                            node.select(".favicon.hover")
                                                .style("opacity", 1)
                                                .attr("width", baseIconSize * scaleFactor)
                                                .attr("height", baseIconSize * scaleFactor)
                                                .attr("x", -(baseIconSize * scaleFactor) / 2)
                                                .attr("y", -fontSize * 1.2 * scaleFactor);

                                            // Scale the entire content group
                                            node.select(".node-content")
                                                .style("transform", `scale(${scaleFactor})`)
                                                .style("transform-origin", "center center");

                                            node.select("circle")
                                                .transition()
                                                .duration(400)
                                                .ease(d3.easeCubicOut)
                                                .style("transform", `scale(${scaleFactor})`)
                                                .style("transform-origin", "center center")
                                                .style("filter", `drop-shadow(0 0 ${Math.min(12 * scaleFactor, 24)}px rgba(0,0,0,0.25))`)
                                                .style("z-index", 1000);
                                        }

                                        if (!self.isTouchDevice) {
                                            self.showDataHint(event, {
                                                title: nodeHintTitle,
                                                hint: nodeHintValue,
                                                element: event.target
                                            });
                                        }
                                    })
                                    .on("mouseout", function (event) {
                                        const toElement = event.relatedTarget;
                                        const node = d3.select(this.parentNode);

                                        if (d.group !== 2 && !node.node().contains(toElement)) {
                                            // Switch back to default favicon
                                            node.select(".favicon.default").style("opacity", 1);
                                            node.select(".favicon.hover")
                                                .style("opacity", 0)
                                                .attr("width", baseIconSize)
                                                .attr("height", baseIconSize)
                                                .attr("x", -baseIconSize / 2)
                                                .attr("y", -fontSize * 1.2);

                                            // Reset transforms for both circle and content
                                            node.select(".node-content")
                                                .style("transform", "scale(1)");

                                            node.select("circle")
                                                .transition()
                                                .duration(300)
                                                .ease(d3.easeBackOut.overshoot(0.2))  // Slight bounce effect
                                                .style("transform", "scale(1)")
                                                .style("transform-origin", "center center")
                                                .style("filter", "drop-shadow(2px 2px 4px rgba(0,0,0,0.2))")
                                                .style("z-index", null);
                                        }

                                        if (!node.node().contains(toElement) && !self.isTouchDevice) {
                                            self.removeDataHint(event);
                                        }
                                    });
                            } else {

                                // HERE goes text WITHOU link

                                // Break text into words and create lines
                                const words = word.split(/\s+/);
                                const maxCharsPerLine = 8; //Math.floor(availableWidth / (fontSize * estimatedCharWidth));
                                const lines = [];
                                let currentLine = [];
                                let currentLineLength = 0;

                                // Group words into lines based on available width
                                words.forEach(word => {
                                    if (currentLineLength + word.length + 1 <= maxCharsPerLine) {
                                        currentLine.push(word);
                                        currentLineLength += word.length + 1;
                                    } else {
                                        if (currentLine.length > 0) {
                                            lines.push(currentLine.join(' '));
                                        }
                                        currentLine = [word];
                                        currentLineLength = word.length;
                                    }
                                });
                                if (currentLine.length > 0) {
                                    lines.push(currentLine.join(' '));
                                }

                                // Find the longest line length
                                const longestLineLength = Math.max(
                                    ...lines.map(line => line.length),
                                    trendSymbol.length // Consider trend symbol length too
                                );


                                // Calculate total number of lines (including trend symbol line)
                                const totalLines = lines.length + 1; // +1 for trend symbol

                                // Calculate vertical space needed for text
                                const lineSpacing = 1.2; // Space between lines (120% of font size)
                                const verticalSpaceNeeded = diameter * 0.8; // Use 80% of diameter for text

                                // Calculate font size based on both horizontal and vertical constraints
                                const fontSize = Math.min(
                                    availableWidth / (longestLineLength * estimatedCharWidth), // Horizontal constraint
                                    diameter * 0.30, // Maximum size based on diameter
                                    verticalSpaceNeeded / (totalLines * lineSpacing) // Vertical constraint
                                );


                                const textElement = textGroup.append("text")
                                    .attr("data-title", nodeHintTitle)
                                    .attr("data-hint", nodeHintValue)
                                    .attr("x", 0)
                                    .style("font-size", `${fontSize}px`)
                                    .style("fill", "#ffffff")
                                    .style("font-family", "'Segoe UI', 'Arial', sans-serif")
                                    .style("paint-order", "stroke")
                                    .style("stroke", "rgba(0,0,0,0.3)")
                                    .style("stroke-width", "1px")
                                    .style("alignment-baseline", "middle")
                                    .attr("text-anchor", "middle")
                                    // Add event handlers for the text element
                                    .on("mouseover", function (event) {
                                        event.stopPropagation();
                                        const node = d3.select(this.parentNode);
                                        node.raise();

                                        if (!self.isTouchDevice) {
                                            self.showDataHint(event, {
                                                title: nodeHintTitle,
                                                hint: nodeHintValue,
                                                element: event.target
                                            });
                                        }
                                    })
                                    .on("mouseout", function (event) {
                                        const toElement = event.relatedTarget;
                                        const node = d3.select(this.parentNode);

                                        if (!node.node().contains(toElement) && !self.isTouchDevice) {
                                            self.removeDataHint(event);
                                        }
                                    })
                                    .on("click", function (event) {
                                        event.stopPropagation();
                                        if (self.isTouchDevice) {
                                            self.showDataHint(event, {
                                                title: nodeHintTitle,
                                                hint: nodeHintValue,
                                                element: event.target
                                            });
                                        }
                                    });


                                // Calculate vertical position
                                const lineHeight = fontSize * 1.2;
                                const totalHeight = (lines.length + 1) * lineHeight; // +1 for trend symbol
                                const startY = -totalHeight / 2 + lineHeight / 2;

                                // Add each line as a tspan
                                lines.forEach((line, index) => {
                                    textElement.append("tspan")
                                        .attr("x", 0)
                                        .attr("y", startY + (index * lineHeight))
                                        .text(line);
                                });

                                // Add trend symbol on its own line
                                textElement.append("tspan")
                                    .attr("x", 0)
                                    .attr("y", startY + (lines.length * lineHeight))
                                    .text(trendSymbol);
                            }
                        }

                        // Removed inner glow circle as it was causing readability issues
                        // The inner glow effect was creating circles with fill:none that made text unreadable


                        // Add label if needed
                        if (d.label) {
                            element.append("text")
                                .attr("dy", ".35em")
                                .attr("text-anchor", "middle")
                                .text(d.label)
                                .attr("fill", self.getLabelColor());
                        }

                    }



                    createdNodeShape
                        .style("transition", "all 0.3s ease")
                        .on("mouseover touchstart", function (event, d) {
                            const node = d3.select(this.parentNode);
                            node.raise(); // Bring to front

                            if (d.group !== 2) {

                                const circle = node.select("circle");
                                const currentDiameter = (d.r || 10) * 2; // Get current diameter                                
                                const scaleFactor = 2.0;

                                // Apply transform with 2x scale
                                // Apply calculated scale
                                circle
                                    .style("transform", `scale(${scaleFactor})`)
                                    .style("filter", "drop-shadow(0 0 12px rgba(0,0,0,0.4))");

                                // Scale text to match
                                node.select("text")
                                    .style("transform", `scale(${scaleFactor})`);

                            };

                            if (!self.isTouchDevice) {
                                self.showDataHint(event, {
                                    title: nodeHintTitle,
                                    hint: nodeHintValue,
                                    element: event.target
                                });
                            }
                        })
                        .on("mouseout touchend", function (event) {
                            // Check if we're moving to a child element (like the link)
                            const toElement = event.relatedTarget;
                            const node = d3.select(this.parentNode);

                            // Only reset if we're not moving to a child element of the node
                            if (d.group !== 2 && !node.node().contains(toElement)) {

                                if (!node.node().contains(toElement)) {
                                    // Reset transforms
                                    node.select("circle")
                                        .style("transform", "scale(1)")
                                        .style("filter", "drop-shadow(2px 2px 4px rgba(0,0,0,0.2))");

                                    node.select("text")
                                        .style("transform", "scale(1)");

                                }
                                if (!self.isTouchDevice) {
                                    self.removeDataHint(event);
                                }

                            }
                        })
                        .on("click", (event) => {
                            event.stopPropagation();
                            if (self.isTouchDevice) {
                                self.showDataHint(event, {
                                    title: nodeHintTitle,
                                    hint: nodeHintValue,
                                    element: event.target
                                });
                            }
                        });



                    // adding handler for circles and rect
                    if (this.isTouchDevice) {
                        document.addEventListener('touchend', (e) => {
                            if (!e.target.closest('rect') && !e.target.closest('circle')) {
                                self.removeDataHint();
                            }
                        });
                    }

                });
            },

            initUniversalGraph({
                sourceArrayName,                // 'organizations', 'keywords', 'links', 'linkTypes'
                containerId,             // ID of container element (e.g., 'keywords_graph')
                filteredItems,           // Filtered array of items
                selectedAIEngine,        // Current AI engine selection
                defaultDensity          // Default density value for the graph
            }) {
                if (IS_DEBUG) {
                    console.debug(`initUniversalGraph: starting init: source: "${sourceArrayName}" graph, containerId: "${containerId}"`);
                }

                // Handle array inputs for selectedAIEngine
                if (Array.isArray(selectedAIEngine)) {
                    if (selectedAIEngine.length === 0 || selectedAIEngine.length === this.bots.length) {
                        // If no models selected or all models selected, use ALL_MODELS
                        selectedAIEngine = this.ALL_MODELS_OPTION_CAPTION || 'All';
                    } else if (selectedAIEngine.length === 1) {
                        // If only one model selected, use that model
                        selectedAIEngine = selectedAIEngine[0];
                    } else {
                        // Multiple models selected (but not all) - treat as all for now
                        // In the future, we could enhance this to show combined data
                        selectedAIEngine = this.ALL_MODELS_OPTION_CAPTION || 'All';
                    }
                }

                // Ensure selectedAIEngine defaults to 'All' if not set
                if (!selectedAIEngine || selectedAIEngine === 'undefined') {
                    selectedAIEngine = this.ALL_MODELS_OPTION_CAPTION || 'All';
                    console.debug(`selectedAIEngine was undefined, defaulting to: "${selectedAIEngine}"`);
                }

                console.debug(`initUniversalGraph: containerId: "${containerId}", selectedAIEngine: "${selectedAIEngine}"`);
                const container = document.getElementById(containerId);

                if (!container) {
                    // Check if this block was filtered out due to empty data
                    const blockExists = this.CURRENT_VISUAL_OBJECTS_ARRAY.some(obj => obj.id === containerId);
                    if (!blockExists) {
                        console.debug(`Skipping graph initialization for ${containerId} - block was filtered out (empty data)`);
                        return;
                    }
                    // Container not found, return gracefully (might be in hidden tab)
                    console.debug(`Container not found: ${containerId} for source: ${sourceArrayName} - skipping initialization`);
                    return;
                }

                container.innerHTML = '';
                const width = container.clientWidth || 800;  // Default width if container is hidden
                const height = container.clientHeight || 600; // Default height if container is hidden


                // Create SVG
                const svg = d3.select(`#${containerId}`)
                    .append("svg")
                    .attr("width", "100%")
                    .attr("height", "100%");

                const g = svg.append("g")
                    .attr("transform", `translate(${width / 2}, ${height / 2}) scale(1) translate(${-width / 2}, ${-height / 2})`);

                // Create nodes and links
                const nodes = [];
                const links = [];
                const connections = {};

                console.debug(`initUniversalGraph: source: "${sourceArrayName}" filteredItems.length: ${filteredItems.length}`);

                // updating current_filtered_count
                if (filteredItems.length != this[`total_count_${containerId}`]) {
                    this[`current_filtered_count_${containerId}`] = filteredItems.length;
                }
                else {
                    // set to -1 if all items are shown
                    this[`current_filtered_count_${containerId}`] = -1;
                }

                console.debug(`initUniversalGraph: ${sourceArrayName}, current_filtered_count_${containerId}: ${this[`current_filtered_count_${containerId}`]}`);

                console.debug(`initUniversalGraph: ${sourceArrayName} filteredItems.length: ${filteredItems.length}`);

                if (!filteredItems || filteredItems.length === 0) {
                    console.debug(`No items found for: source array: ${sourceArrayName} and selectedAIEngine: ${selectedAIEngine}`);
                    return; // Return gracefully instead of throwing error
                }

                // saving into a separate variable
                const self = this;

                // FIRST PASS: Collect all unique bots across all items and assign them fixed positions
                const allUniqueBots = new Set();
                filteredItems.forEach((el) => {
                    const itemModels = el.bots.split(',').map(bot => bot.trim());
                    itemModels.forEach(bot => allUniqueBots.add(bot));
                });

                // Pre-calculate positions for all bots to ensure even distribution around circle
                const totalUniqueBots = allUniqueBots.size;
                const botPositions = new Map();
                let botIndex = 0;

                allUniqueBots.forEach(botId => {
                    // Calculate position for bot nodes around edges in a circle
                    const angle = (botIndex / totalUniqueBots) * 2 * Math.PI - Math.PI / 2; // Start from top
                    const radius = Math.min(width, height) * 0.45; // Position at 45% of viewport size (closer to edges)

                    botPositions.set(botId, {
                        x: width / 2 + Math.cos(angle) * radius,
                        y: height / 2 + Math.sin(angle) * radius,
                        index: botIndex
                    });
                    botIndex++;
                });

                // SECOND PASS: Create nodes based on items
                filteredItems.forEach((el, index) => {
                    const itemModels = el.bots.split(',').map(bot => bot.trim());
                    connections[el.value] = itemModels.length;

                    let currentCalculatedSize = (selectedAIEngine === self.ALL_MODELS_OPTION_CAPTION)
                        ? el.mentions
                        : (el.mentionsByModel && el.mentionsByModel[selectedAIEngine]) || 0;


                    // overrifed with influence for EE
                    currentCalculatedSize = (selectedAIEngine === self.ALL_MODELS_OPTION_CAPTION)
                        ? el.influence
                        : (el.influenceByModel && el.influenceByModel[selectedAIEngine]) || 0;


                    // Enhanced influence validation and logging
                    const originalCalculatedSize = currentCalculatedSize;
                    if (currentCalculatedSize == null || currentCalculatedSize === undefined) {
                        currentCalculatedSize = 0;
                        console.debug(`Item ${el.value}: influence is null/undefined, setting to 0`);
                    } else if (!isFinite(currentCalculatedSize) || isNaN(currentCalculatedSize)) {
                        console.warn(`Item ${el.value}: invalid influence value ${originalCalculatedSize}, setting to 0`);
                        currentCalculatedSize = 0;
                    } else if (currentCalculatedSize < 0) {
                        console.warn(`Item ${el.value}: negative influence ${currentCalculatedSize}, setting to 0`);
                        currentCalculatedSize = 0;
                    }


                    // Log influence data for debugging
                    if (IS_DEBUG && index < 5) { // Log first 5 items to avoid spam
                        console.debug(`Item ${index + 1}: "${el.value}" - calculated size: ${currentCalculatedSize}, models: [${itemModels.join(', ')}]`);
                        if (selectedAIEngine !== self.ALL_MODELS_OPTION_CAPTION && el.influenceByModel) {
                            console.debug(`Available influence by model:`, Object.keys(el.influenceByModel));
                        }
                    }


                    // Create nodes for itemts
                    nodes.push({
                        id: el.value,
                        type: 'node',
                        sourceArrayName: sourceArrayName, // source array name
                        containerId: containerId, // container id (id of the element with the graph in html)
                        selectedAIEngine: selectedAIEngine, // selected AI engine (we use it for hint, no need to monitor because we recreate nodes when AI engine selection changes)
                        status: el.status,
                        group: 1,
                        connections: itemModels.length,
                        link: self.makeClickableUrl(el.link),
                        weight: 0, //currentInfluence || 0, 

                        calculatedSize: currentCalculatedSize,

                        color: self.getColorFromStringAndSize(el.value, currentCalculatedSize),
                        r: self.getNodeRadius({
                            group: 1,
                            calculatedSize: currentCalculatedSize
                        })
                    });

                    // Create bot nodes and links using pre-calculated positions
                    itemModels.forEach(bot => {
                        const currentModelWeight = self.bots.find(b => b.id === bot)?.weight || 0;
                        if (!nodes.some(n => n.id === bot)) {
                            // Use pre-calculated position from botPositions map
                            const position = botPositions.get(bot);
                            if (!position) {
                                console.error(`No position found for bot: ${bot}`);
                                return;
                            }

                            nodes.push({
                                id: bot,
                                type: 'bot',
                                x: position.x,  // Initial x position on circle
                                y: position.y,  // Initial y position on circle
                                fx: position.x, // Fixed x position (temporarily)
                                fy: position.y, // Fixed y position (temporarily)
                                containerId: containerId, // container id (id of the element with the graph in html)
                                group: 2,
                                weight: 0, //currentModelWeight,
                                selectedAIEngine: selectedAIEngine, // selected AI engine (we use it for hint, no need to monitor because we recreate nodes when AI engine selection changes)
                                //r: currentModelWeight * GRAPH_BOT_SIZE || GRAPH_BOT_SIZE,
                                r: GRAPH_BOT_SIZE * 1, // Fixed scale factor
                                name: self.getModelNameById(bot)
                            });
                        }
                        links.push({ source: el.value, target: bot, value: 1 });
                    });
                });

                console.debug(`initUniversalGraph: ${sourceArrayName} nodes.length: ${nodes.length}`);


                // Log influence distribution for debugging
                const itemNodes = nodes.filter(n => n.type === 'node');
                if (itemNodes.length > 0) {
                    const influences = itemNodes.map(n => n.influence).filter(inf => inf > 0);
                    if (influences.length > 0) {
                        const minInf = Math.min(...influences);
                        const maxInf = Math.max(...influences);
                        const avgInf = influences.reduce((a, b) => a + b) / influences.length;
                        console.debug(`Influence distribution: min=${minInf.toFixed(6)}, max=${maxInf.toFixed(6)}, avg=${avgInf.toFixed(6)}, count=${influences.length}`);

                        // Show radius distribution
                        const radii = itemNodes.map(n => n.r);
                        const minRadius = Math.min(...radii);
                        const maxRadius = Math.max(...radii);
                        console.debug(`Node radius distribution: min=${minRadius.toFixed(1)}, max=${maxRadius.toFixed(1)}`);
                    } else {
                        console.warn(`No items with positive influence found in ${sourceArrayName}`);
                    }
                }


                // Calculate weights
                links.forEach(link => {
                    const sourceNode = nodes.find(n => n.id === link.source);
                    const targetNode = nodes.find(n => n.id === link.target);
                    sourceNode.weight++;
                    targetNode.weight++;
                });

                console.debug(`initUniversalGraph: ${sourceArrayName} links.length: ${links.length}`);

                // Set up force simulation
                const simulation = this.setupForceSimulationForD3Chart(d3, nodes, links, width, height);

                if (!simulation) {
                    console.error('Failed to create force simulation');
                    return;
                }

                // Function to create curved links
                function linkArc(d) {
                    const dx = d.target.x - d.source.x,
                        dy = d.target.y - d.source.y,
                        dr = Math.sqrt(dx * dx + dy * dy);
                    return `M${d.source.x},${d.source.y}A${dr},${dr} 0 0,1 ${d.target.x},${d.target.y}`;
                }

                // Create links
                const link = g.append("g")
                    .attr("stroke", self.isDarkMode ? "#6b7280" : "#999")
                    .attr("stroke-opacity", 0.6)
                    .selectAll("path")
                    .data(links)
                    .join("path")
                    .attr("fill", "none")
                    .style("stroke-width", d => GRAPH_LINK_THICKNESS * 1) // Fixed scale factor
                    .attr("stroke-width", d => GRAPH_LINK_THICKNESS * 1); // Fixed scale factor

                // Create nodes
                const node = g.append("g")
                    .attr("stroke", "#fff")
                    .attr("stroke-width", 1.5)
                    .selectAll("g")
                    .data(nodes)
                    .join("g")
                    .call(selection => self.createNodeShape.call(self, selection))
                    .attr("fill", d => d.group === 1 ? self.getColorFromStringAndSize(d.id, d.calculatedSize) : 'none')
                    .call(self.drag(simulation));

                // Create labels with backgrounds
                const labelsGroup = g.append("g")
                    .attr("class", "labels");

                const labelContainers = labelsGroup.selectAll("g")
                    .data(nodes)
                    .enter()
                    .append("g")
                    .attr("class", "label-container");

                // Add the text elements first to measure them
                const labels = labelContainers.append("text")
                    .attr("dx", d => d.r + 4)
                    .attr("dy", ".35em")
                    .style("text-anchor", "start")  // Add this line for left alignment
                    .each(function (d) {
                        const label = d3.select(this);
                        // bot
                        if (d.group === 2) {
                            label.text(d.name);
                        } else { // d.group == 1 , so it is item
                            const originalItem = filteredItems.find(i => i.value === d.id);

                            if (IS_DEBUG) {
                                console.debug('originalItem', JSON.stringify(originalItem));
                            }
                            if (!originalItem) {
                                console.error('originalItem not found for', d.id);
                                label.text(d.id); // Fallback to just showing the ID
                            } else {
                                // get influence trend
                                let appearanceOrderTrend = TRENDS.UNKNOWN; // by default

                                if (d.selectedAIEngine === self.ALL_MODELS_OPTION_CAPTION) {
                                    appearanceOrderTrend = originalItem.appearanceOrderTrend;
                                }
                                else {
                                    appearanceOrderTrend = originalItem.appearanceOrderByModelTrend ?
                                        originalItem.appearanceOrderByModelTrend[d.selectedAIEngine] : TRENDS.UNKNOWN;
                                }

                                if (IS_DEBUG) {
                                    console.debug(`initUniversalGraph (containerId=${containerId}): appearanceOrderTrend: ${appearanceOrderTrend}, selectedAIEngine: ${d.selectedAIEngine}`);
                                }

                                if (originalItem.link && originalItem.link.length > 0) {

                                    let displayCaption = originalItem.value;
                                    // if we have value containing the link effectively, we use the domain instead
                                    if (displayCaption === originalItem.link) {
                                        const domain = self.extractDomain(originalItem.link);
                                        displayCaption = self.truncateString(displayCaption);
                                        if (displayCaption.length < domain.length) {
                                            displayCaption = domain;
                                        }
                                    }

                                    label.append("a")
                                        .text(() => {
                                            if (IS_DEBUG) {
                                                console.debug(`getTrendSymbol: ${originalItem.value}: ${appearanceOrderTrend}, symbol: ${self.getTrendSymbol(appearanceOrderTrend)}; d.selectedAIEngine: ${d.selectedAIEngine}`);
                                            }
                                            return `${displayCaption} ${self.getTrendSymbol(appearanceOrderTrend)}`;
                                        })
                                        .attr("fill", document.documentElement.classList.contains('dark') ? "#60a5fa" : "#2563eb")  // Blue-400 in dark mode, blue-600 in light mode
                                        .style("text-decoration", "underline")
                                        .attr("xlink:href", self.makeClickableUrl(originalItem.link))
                                        .attr("target", "_blank")
                                        .attr("rel", "noopener noreferrer");

                                } else {
                                    label.text(() => originalItem.value + ' ' +
                                        self.getTrendSymbol(appearanceOrderTrend));
                                }
                            }
                        }

                    })
                    .style("font-size", "12px")
                    .style("fill", self.getLabelColor())
                    .style("transition", "fill 0.3s ease");

                // Add background rectangles after text is created
                labelContainers.each(function (d) {
                    const container = d3.select(this);
                    const textElement = container.select("text");
                    const bbox = textElement.node().getBBox();

                    // Insert rect before text (so it appears behind)
                    container.insert("rect", "text")
                        .attr("x", bbox.x - 2)
                        .attr("y", bbox.y - 1)
                        .attr("width", bbox.width + 4)
                        .attr("height", bbox.height + 2)
                        .attr("fill", self.isDarkMode ? "rgba(30, 30, 30, 0.85)" : "rgba(255, 255, 255, 0.85)")
                        .attr("stroke", self.isDarkMode ? "rgba(60, 60, 60, 0.5)" : "rgba(200, 200, 200, 0.5)")
                        .attr("stroke-width", 0.5)
                        .attr("rx", 2)
                        .attr("ry", 2);
                });


                // Set up zoom behavior
                const zoom = d3.zoom()
                    .scaleExtent([0.5, 4]) // Allow zoom from 50% to 400%
                    .filter(event => {
                        // Allow all events except wheel/deltaY (mouse scroll)
                        return event.type !== 'wheel';
                    })
                    .on("zoom", (event) => {
                        g.attr("transform", event.transform);
                    });

                svg.call(zoom);

                // Store zoom behavior for programmatic control
                this[`zoom_${containerId}`] = zoom;

                // Add double-click to reset zoom
                svg.on("dblclick.zoom", () => {
                    svg.transition().duration(300).call(zoom.transform, d3.zoomIdentity);
                });

                // Update position on each tick
                simulation.on("tick", () => {
                    link.attr("d", linkArc);
                    node.attr("transform", d => `translate(${d.x},${d.y})`);
                    labelContainers.attr("transform", d => `translate(${d.x},${d.y})`);


                    /* uncomment if use multiple lines
                    labels.selectAll("tspan")
                        .attr("x", d => d.x + d.r + 10);  // Update all tspans to maintain alignment
                    */

                });

                // Store simulation reference
                simulationRef = simulation;
                this[`simulation_${containerId}`] = simulation;

                // Initialize with default density
                this.updateForceStrength(defaultDensity, containerId);


                // Run and stabilize simulation
                simulation.alpha(1).restart();
                setTimeout(() => {
                    simulation.alpha(0.3);
                }, 100);
                setTimeout(() => {
                    simulation.stop();
                }, 2000);


                // Add click handler to prevent propagation
                node.on("click", (event, d) => {
                    event.stopPropagation();
                    // showNodeInfo(d);
                });

                // Add an event listener for dark mode toggle
                this.$watch('isDarkMode', () => {
                    labels.style("fill", this.getLabelColor());
                    // Update label backgrounds
                    labelContainers.selectAll("rect")
                        .attr("fill", this.isDarkMode ? "rgba(30, 30, 30, 0.85)" : "rgba(255, 255, 255, 0.85)")
                        .attr("stroke", this.isDarkMode ? "rgba(60, 60, 60, 0.5)" : "rgba(200, 200, 200, 0.5)");
                });

                // Scale graph after Vue updates and simulation settles
                // Use setTimeout to ensure DOM is fully ready
                setTimeout(() => {
                    this.scaleGraph(containerId);
                }, 100);

                if (IS_DEBUG) {
                    console.debug(`initUniversalGraph: finished init: source: "${sourceArrayName}", containerId: "${containerId}"`);
                }

            },


            setupEventListeners() {
                // setup for all tables
                get_DEFAULT_VISUAL_OBJECTS_ARRAY().filter(obj => obj.type === 'table-with-items').forEach(obj => {
                    if (document.getElementById(`button_expand_${obj.id}`)) {
                        document.getElementById(`button_expand_${obj.id}`).addEventListener('click', () => this.expand_table(obj));
                    }
                });
            },

            updateShowMoreButtons() {

                get_DEFAULT_VISUAL_OBJECTS_ARRAY().filter(obj => obj.type === 'table-with-items').forEach(obj => {
                    const btn = document.getElementById(`button_expand_${obj.id}`);
                    if (btn) {
                        // checking buttons
                        const isAllItemsShown = this[`current_visible_items_count_${obj.id}`] >= this[`filtered_${obj.id}`].length;
                        btn.disabled = isAllItemsShown;
                        btn.textContent = isAllItemsShown ? 'All Shown' : 'Show More';
                        btn.classList.toggle('opacity-50', isAllItemsShown);
                        btn.classList.toggle('cursor-not-allowed', isAllItemsShown);
                    }
                });

            },


            init_graph(obj) {
                // Check if container exists before initializing
                const container = document.getElementById(obj.id);
                if (!container) {
                    console.debug(`Graph container ${obj.id} not found, skipping initialization`);
                    return;
                }

                this.initUniversalGraph({
                    sourceArrayName: obj.sourceArrayName,
                    containerId: obj.id,
                    filteredItems: this[`filtered_${obj.id}`],
                    selectedAIEngine: this[`selected_${obj.id}_AIModels`],
                    selectedTrend: this[`selected_${obj.id}_Trend`],
                    simulationRef: this[`simulation_${obj.id}`],
                    defaultDensity: DEFAULT_KEYWORD_DENSITY
                });
            },



            setupForceSimulationForD3Chart(d3, nodes, links, width, height) {
                if (!d3 || !nodes || !links || !width || !height) {
                    console.error('Missing required parameters for force simulation');
                    return null;
                }

                // Calculate dynamic forces based on graph size
                const nodeCount = nodes.length;
                const LINK_DISTANCE = Math.min(width, height) / (Math.sqrt(nodeCount) * 2);
                const CHARGE_STRENGTH = -Math.min(width, height) / 2;

                return d3.forceSimulation(nodes)
                    // Link force with dynamic distance
                    .force("link", d3.forceLink(links)
                        .id(d => d.id)
                        .distance(d => {
                            const baseDistance = LINK_DISTANCE;
                            // Shorter distance between bot and term nodes for clustering (group 2 = bot)
                            if (d.source.group === 2 || d.target.group === 2) {
                                return baseDistance * 0.7; // Closer clustering around bots
                            }
                            const sourceCalculatedSize = d.source.calculatedSize || 1;
                            const targetCalculatedSize = d.target.calculatedSize || 1;
                            // Larger nodes should have more space between them
                            return baseDistance * (sourceCalculatedSize + targetCalculatedSize);
                        })
                        .strength(d => {
                            // Stronger link force for bot connections (group 2 = bot)
                            if (d.source.group === 2 || d.target.group === 2) {
                                return 0.5;
                            }
                            return 0.3;
                        }))

                    // Charge force with dynamic strength
                    .force("charge", d3.forceManyBody()
                        .strength(d => {
                            // Bot nodes (group 2) have stronger repulsion to maintain separation
                            if (d.group === 2) {
                                return CHARGE_STRENGTH * 1.5;
                            }
                            // Larger nodes repel more strongly
                            const nodeInfluence = d.calculatedSize || 1;
                            return CHARGE_STRENGTH * nodeInfluence * 0.8;
                        })
                        .distanceMin(10)
                        .distanceMax(Math.min(width, height) / 2))

                    // Radial force for bot nodes to keep them at edges
                    .force("radial", d3.forceRadial()
                        .radius(d => d.group === 2 ? Math.min(width, height) * 0.45 : 0)
                        .x(width / 2)
                        .y(height / 2)
                        .strength(d => d.group === 2 ? 0.95 : 0))

                    // Center force - very weak, primarily for term nodes
                    .force("center", d3.forceCenter(width / 2, height / 2).strength(0.001))

                    // Position forces - much stronger for bot nodes to maintain edge positions
                    .force("x", d3.forceX(d => {
                        // Bot nodes (group 2) strongly attracted to their initial positions
                        if (d.group === 2 && d.fx !== undefined) {
                            return d.fx;
                        }
                        return width / 2;
                    }).strength(d => d.group === 2 ? 0.8 : 0.02))
                    .force("y", d3.forceY(d => {
                        // Bot nodes (group 2) strongly attracted to their initial positions
                        if (d.group === 2 && d.fy !== undefined) {
                            return d.fy;
                        }
                        return height / 2;
                    }).strength(d => d.group === 2 ? 0.8 : 0.02))

                    // Collision detection with dynamic radius
                    .force("collision", d3.forceCollide()
                        .radius(d => {
                            const baseRadius = d.r || 30;
                            const influenceFactor = d.calculatedSize || 1;
                            return baseRadius * Math.sqrt(influenceFactor) * 1.2;
                        })
                        .strength(0.8)
                        .iterations(2))

                    // Configure simulation parameters
                    .velocityDecay(0.4) // Add some damping
                    .alphaMin(0.001)    // Lower alpha min for longer simulation
                    .alphaDecay(0.02)   // Slower decay for more stable layout
                    .alpha(0.3)         // Start with moderate alpha
                    .on("tick", () => {
                        // Constrain nodes within bounds on each tick
                        nodes.forEach(node => {
                            if (node.group === 2) {
                                // Keep bot nodes (group 2) closer to their fixed positions
                                const targetX = node.fx || node.x;
                                const targetY = node.fy || node.y;
                                node.x = node.x * 0.7 + targetX * 0.3; // Blend toward target position
                                node.y = node.y * 0.7 + targetY * 0.3;
                            }
                            // Ensure all nodes stay within bounds
                            node.x = Math.max(node.r || 30, Math.min(width - (node.r || 30), node.x));
                            node.y = Math.max(node.r || 30, Math.min(height - (node.r || 30), node.y));
                        });
                    })
                    .on("end", () => {
                        // After simulation settles, release fixed positions to allow dragging
                        nodes.forEach(node => {
                            if (node.group === 2) {
                                // Store the settled positions but allow movement
                                const settledX = node.x;
                                const settledY = node.y;
                                node.fx = null;
                                node.fy = null;
                                // Store settled positions for reference
                                node.targetX = settledX;
                                node.targetY = settledY;
                            }
                        });
                    });
            },

            // Update the scaleGraph function to handle initial node position
            scaleGraph(graphId) {
                const container = document.getElementById(graphId);
                const svg = d3.select(`#${graphId} svg`);
                const graphContent = svg.select("g");

                if (!container || !graphContent.node()) {
                    console.warn(`Unable to scale graph ${graphId}`);
                    return;
                }

                const margin = 40;
                const containerWidth = container.clientWidth - (2 * margin);
                const containerHeight = container.clientHeight - (2 * margin);
                const bounds = graphContent.node().getBBox();

                // Calculate optimal scale
                const scaleX = containerWidth / (bounds.width || 1);
                const scaleY = containerHeight / (bounds.height || 1);
                let scale = Math.min(scaleX, scaleY, 2); // Cap maximum scale at 2
                scale = Math.max(scale, 0.4); // Ensure minimum scale of 0.4

                // Calculate centering translation
                const translateX = ((containerWidth - (bounds.width * scale)) / 2) - (bounds.x * scale) + margin;
                const translateY = ((containerHeight - (bounds.height * scale)) / 2) - (bounds.y * scale) + margin;

                // Apply transform with transition
                graphContent
                    .transition()
                    .duration(750)
                    .attr("transform", `translate(${translateX},${translateY}) scale(${scale})`);

                // Update SVG viewBox
                svg.attr("viewBox", `0 0 ${containerWidth + (2 * margin)} ${containerHeight + (2 * margin)}`);
            },

            getLinkDistance(d, normalizedStrength) {
                const baseDistance = 200; // Increased from 100
                const sourceRadius = d.source.r;
                const targetRadius = d.target.r;
                return (baseDistance + sourceRadius + targetRadius) * (1 - normalizedStrength * 0.3); // Reduced factor from 0.5 to 0.3
            },

            getChargeStrength(d, normalizedStrength) {
                const baseCharge = d.group === 1 ? -500 : -200; // Increased from -200 and -50
                return baseCharge * (1 - normalizedStrength * 0.3); // Reduced factor from 0.5 to 0.3
            },


            getNodeRadius(dd) {
                // Inline scaling factor calculation to avoid context issues
                const NODE_SCALING_FACTOR = window.innerWidth < 768 ? GRAPH_SCALING_FACTOR_ON_MOBILE : 1;

                if (dd.group === 2) { // Model
                    return GRAPH_BOT_SIZE * NODE_SCALING_FACTOR;
                } else { // Keyword or Link
                    // Ensure numeric influence
                    let ddCalculatedSize = Number(dd.calculatedSize);
                    if (!isFinite(ddCalculatedSize)) ddCalculatedSize = 0;

                    console.debug(`Node radius calculation: item=${dd.id}, influence=${ddCalculatedSize}`);

                    if (ddCalculatedSize === 0) {
                        // Use small default for disappeared/zero influence to keep visible
                        ddCalculatedSize = GRAPH_BOT_DISAPPERED_DEFAULT_CALCULATED_SIZE;
                        console.debug(`Using default calculated size: ${ddCalculatedSize}`);
                    }

                    // Improved radius calculation with better scaling
                    const minRadius = 8;   // Minimum visible size
                    const maxRadius = 80;  // Maximum size (smaller than previous 100 for better layout)
                    const baseRadius = 12; // Base size for small influence values

                    let radius;

                    // Use different scaling approaches based on influence magnitude
                    if (ddCalculatedSize < 0.001) {
                        // Very small calculated size: minimal but visible
                        radius = minRadius;
                    } else if (ddCalculatedSize < 0.1) {
                        // Small calculated size: linear scaling in small range
                        radius = minRadius + (ddCalculatedSize * 100) * (baseRadius - minRadius);
                    } else if (ddCalculatedSize < 1.0) {
                        // Medium calculated size: square root scaling for better differentiation
                        radius = baseRadius + Math.sqrt(ddCalculatedSize - 0.1) * 30;
                    } else {
                        // Large calculated size: logarithmic scaling to prevent oversized nodes
                        radius = baseRadius + Math.log10(ddCalculatedSize + 1) * 40;
                    }

                    // Apply bounds
                    radius = Math.max(minRadius, Math.min(maxRadius, radius));

                    console.debug(`Calculated radius: ${radius} (calculated size: ${ddCalculatedSize})`);

                    return radius * NODE_SCALING_FACTOR;
                }
            },

            updateForceStrength(strength, graphId) {

                const simulationVarName = `simulation_${graphId}`;
                const simulationVar = this[simulationVarName];

                if (!simulationVar) {
                    throw new Error(`Simulation var "simulation_${graphId}" was not found for type: ${graphId}`);
                }


                if (simulationVar) {
                    const normalizedStrength = (strength - 50) / 50;

                    // Update link distances based on density
                    simulationVar.force("link").distance(d => {
                        // Keep bot-term links shorter for clustering (group 2 = bot)
                        if (d.source.group === 2 || d.target.group === 2) {
                            return this.getLinkDistance(d, normalizedStrength) * 0.7;
                        }
                        return this.getLinkDistance(d, normalizedStrength);
                    });

                    // Update charge strength
                    simulationVar.force("charge").strength(d => {
                        // Bot nodes (group 2) maintain stronger repulsion
                        if (d.group === 2) {
                            return this.getChargeStrength(d, normalizedStrength) * 1.5;
                        }
                        return this.getChargeStrength(d, normalizedStrength);
                    });

                    // Update collision radius
                    simulationVar.force("collision").radius(d => d.r + (d.type === 'node' ? 15 : 20));

                    // Adjust radial force strength based on density
                    simulationVar.force("radial").strength(d => {
                        if (d.group === 2) {
                            // Very strong radial force to keep bot nodes (group 2) at edges
                            return 0.95;
                        }
                        return 0;
                    });

                    simulationVar.alpha(1).restart();

                    // Reset graph position after force update
                    setTimeout(() => {
                        //this.resetZoom(graphId);
                    }, 700); // Wait for simulation to settle
                }
            },

            fitGraphToContainer(g, svg, width, height) {
                const bounds = g.node().getBBox();
                const fullWidth = bounds.width;
                const fullHeight = bounds.height;
                const scale = 0.95 / Math.max(fullWidth / width, fullHeight / height);
                const tx = (width - fullWidth * scale) / 2;
                const ty = (height - fullHeight * scale) / 2;

                svg.call(d3.zoom().transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
            },

            drag(simulation) {
                const dragstarted = (event, d) => {
                    if (!event.active) simulation.alphaTarget(0.3).restart();
                    d.fx = d.x;
                    d.fy = d.y;
                };

                const dragged = (event, d) => {
                    d.fx = event.x;
                    d.fy = event.y;
                };

                const dragended = (event, d) => {
                    if (!event.active) simulation.alphaTarget(0);
                    d.fx = null;
                    d.fy = null;
                };

                return d3.drag()
                    .on("start", dragstarted)
                    .on("drag", dragged)
                    .on("end", dragended)
                    .touchable(true);
            },


            createLinkElementForSummary(url, additionalText, useDomainForText = true) {
                const domain = this.extractDomain(url);
                const link = document.createElement('a');
                link.href = this.makeClickableUrl(url);
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                if (useDomainForText) {
                    link.className = 'text-blue-600 hover:underline';
                    link.textContent = `${domain} ${additionalText}`;
                }
                else {
                    link.className = 'text-blue-600 hover:underline truncate';
                    link.textContent = `${this.cleanAndMinimizeUrl(url)} ${additionalText}`;
                }
                return link;
            },
            makeClickableUrl(url) {
                if (url && url.includes('http')) {
                    return url;
                }
                else {
                    return 'https://' + url;
                }
            },
            extractDomain(url) {
                try {
                    if (!url.toLowerCase().includes('http')) {
                        url = 'http://' + url;
                    }
                    const urlObj = new URL(url);
                    return urlObj.hostname.replace(/^www\./, '');
                } catch (e) {
                    // If URL is invalid, return the original string
                    try {
                        return String(url)
                            .replace(/^https?:\/\/(www\.)?/i, '')
                            .replace(/^www\./i, '')
                            .split(/[\/#?]/, 1)[0];
                    }
                    catch (e) {
                        console.warn(`Invalid URL: ${url}`);
                        return String(url);
                    }
                }
            },

            exportTableToCSV(tableId, filename) {

                // Get the table element
                const table = document.getElementById(tableId);
                if (!table) {
                    console.error(`Table with id "${tableId}" not found`);
                    return;
                }

                let csvContent = "data:text/csv;charset=utf-8,";

                // Get headers and clean them
                const headers = Array.from(table.querySelectorAll('th'))
                    .map(th => {
                        // Remove HTML tags and trim whitespace
                        let headerText = th.textContent.replace(/<\/?[^>]+(>|$)/g, "").trim();
                        // Remove non-visual symbols and extra spaces
                        headerText = headerText.replace(/[^\x20-\x7E]+/g, "").replace(/\s+/g, " ");
                        return headerText;
                    });
                csvContent += headers.map(header => `"${header}"`).join(',') + "\n";

                // Get rows
                const rows = table.querySelectorAll('tbody tr');

                rows.forEach(row => {
                    const rowData = Array.from(row.querySelectorAll('td'))
                        .map(cell => {
                            // Check if data-value attribute exists
                            if (cell.hasAttribute('data-value')) {
                                return `"${cell.getAttribute('data-value').replace(/"/g, '""')}"`;
                            }

                            // If no data-value, proceed with the existing logic
                            const cellClone = cell.cloneNode(true);

                            // Remove all spans with class 'muted' 
                            cellClone.querySelectorAll('span.muted').forEach(span => span.remove());

                            // Get the text content of the cell
                            let content = cellClone.textContent.trim();

                            // If the cell contains a link, use the href instead
                            const link = cellClone.querySelector('a');
                            if (link) {
                                content = link.href;
                            }

                            // Escape double quotes and wrap the content in quotes
                            return `"${content.replace(/"/g, '""')}"`;
                        });
                    csvContent += rowData.join(',') + "\n";
                });

                // add information about AI Chat Watch and date 
                csvContent += `"","",\n\n`
                csvContent += `"","",\n\n`
                csvContent += `"www.AIChatWatch.com"\n`;
                csvContent += `"Exported On","${new Date().toISOString()}"\n`;

                // Create a download link and trigger the download
                const encodedUri = encodeURI(csvContent);
                const link = document.createElement("a");
                link.setAttribute("href", encodedUri);
                link.setAttribute("download", filename);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            },

            // Example method to trigger the export
            exportTable(tableId) {
                const filename = `AIChatWatch_export_${tableId}_${new Date().toISOString()}.csv`;
                this.exportTableToCSV(tableId, filename);
            },

            // Aggregate report methods
            getPromptBreakdownTooltip(item) {
                if (!this.isAggregateReport || !item.mentionsByPrompt) {
                    return '';
                }

                const breakdown = [];
                for (const [promptId, mentions] of Object.entries(item.mentionsByPrompt)) {
                    if (mentions > 0) {
                        const question = this.promptQuestions[promptId] || promptId;
                        breakdown.push(`${promptId}: ${mentions} mentions - "${question}"`);
                    }
                }

                return breakdown.join('\n');
            },

            filterItemsByPrompt(items, selectedPrompt) {
                if (!this.isAggregateReport || selectedPrompt === 'all') {
                    return items;
                }

                return items.filter(item => {
                    return item.mentionsByPrompt && item.mentionsByPrompt[selectedPrompt] > 0;
                });
            },

            getAvailablePrompts() {
                if (!this.isAggregateReport || !this.prompts) {
                    return [];
                }

                return [
                    { id: 'all', label: 'All Prompts' },
                    ...this.prompts.map(promptId => ({
                        id: promptId,
                        label: `${promptId}: ${this.promptQuestions[promptId] || promptId}`
                    }))
                ];
            },

            navigateToPromptReport(promptId) {
                if (!this.isAggregateReport || !promptId || promptId === 'all') {
                    return;
                }

                // Navigate to the specific prompt report
                window.location.href = `./${promptId}/index.html`;
            }
        },


        watch: {

            isDarkMode(newVal) {
                // Update dark mode class when isDarkMode changes
                if (newVal) {
                    document.documentElement.classList.add('dark');
                } else {
                    document.documentElement.classList.remove('dark');
                }
                // Update localStorage
                localStorage.setItem('aicwDarkMode', newVal.toString());
            },

            selectedAction: {
                handler(newVal, oldVal) {
                    console.debug('selectedAction changed:', newVal);
                    // You can perform any additional actions here when selectedAction changes
                },
                deep: true // This ensures the watcher detects nested changes in the object
            },

            // tables watchers like organizations_searchTerm
            ...get_DEFAULT_VISUAL_OBJECTS_ARRAY().filter(obj => obj.hasSearchFilter).reduce((acc, obj) => ({
                ...acc,
                [`${obj.id}_searchTerm`]: {
                    handler() {
                        // Create a debounced function if it doesn't exist
                        if (!this[`_debounced_${obj.id}_update`]) {
                            this[`_debounced_${obj.id}_update`] = this.debounce(() => {
                                this.$nextTick(() => {
                                    try {
                                        console.debug(`Watcher: ${obj.id}_searchTerm: re-initializing table: ${obj.id}`);
                                        if (obj.type === 'table-with-items') {
                                            this.init_table(obj);
                                        }
                                        else if (obj.type === 'graph-with-items') {
                                            this.init_graph(obj);

                                            this.$nextTick(() => {
                                                this.handleResize();
                                            });
                                        }
                                        else if (obj.type === 'chart-with-items') {
                                            this.init_chart(obj);
                                        }
                                    } catch (error) {
                                        console.warn(`Watcher: ${obj.id}_searchTerm: Failed to initialize table ${obj.id}:`, error);
                                    }
                                });
                            }, 300); // 300ms debounce delay
                        }

                        // Call the debounced function
                        this[`_debounced_${obj.id}_update`]();
                    },
                    immediate: false  // Changed from true to false
                }
            }), {}),

            // tables watchers for AI engine selector combobox (FOR TABLES)
            ...get_DEFAULT_VISUAL_OBJECTS_ARRAY().filter(obj => obj.hasModelFilter).reduce((acc, obj) => ({
                ...acc,
                [`selected_${obj.id}_AIModels`]: {
                    handler() {
                        this.$nextTick(() => {
                            if (obj.type === 'table-with-items') {
                                this.init_table(obj);
                            }
                            else if (obj.type === 'graph-with-items') {
                                this.init_graph(obj);

                                this.$nextTick(() => {
                                    this.handleResize();
                                });
                            }
                            else if (obj.type === 'chart-with-items') {
                                this.init_chart(obj);
                            }
                        });
                    },
                    immediate: false // if needed
                }
            }), {}),

            // tables watchers for AI engine selector combobox (FOR TABLES)
            ...get_DEFAULT_VISUAL_OBJECTS_ARRAY().filter(obj => obj.hasAppearanceOrderTrendFilter).reduce((acc, obj) => ({
                ...acc,
                [`selected_${obj.id}_appearanceOrder_Trends`]: {
                    handler() {
                        this.$nextTick(() => {
                            if (obj.type === 'table-with-items') {
                                this.init_table(obj);
                            }
                            else if (obj.type === 'graph-with-items') {
                                this.init_graph(obj);

                                this.$nextTick(() => {
                                    this.handleResize();
                                });
                            }
                            else if (obj.type === 'chart-with-items') {
                                this.init_chart(obj);
                            }
                        });
                    },
                    immediate: false // if needed
                }
            }), {}),

            // watchers for graph top items limit
            ...get_DEFAULT_VISUAL_OBJECTS_ARRAY().filter(obj => obj.type === 'graph-with-items').reduce((acc, obj) => ({
                ...acc,
                [`${obj.id}_topItemsLimit`]: {
                    handler() {
                        this.$nextTick(() => {
                            this.init_graph(obj);
                            this.$nextTick(() => {
                                this.handleResize();
                            });
                        });
                    },
                    immediate: false
                }
            }), {}),

            selectedAction() {
                this.updateActionModalContent();
            },

            // Watcher for aggregate report prompt filter
            selectedPromptFilter: {
                handler() {
                    if (this.isAggregateReport) {
                        this.$nextTick(() => {
                            // Re-initialize all visual objects when prompt filter changes
                            this.CURRENT_VISUAL_OBJECTS_ARRAY.forEach(obj => {
                                if (obj.type === 'table-with-items') {
                                    this.init_table(obj);
                                } else if (obj.type === 'graph-with-items') {
                                    this.init_graph(obj);
                                    this.$nextTick(() => {
                                        this.handleResize();
                                    });
                                } else if (obj.type === 'chart-with-items') {
                                    this.init_chart(obj);
                                }
                            });
                        });
                    }
                },
                immediate: false
            }
        },
        directives: {
            selectableText: {
                bind(el) {
                    // Add the class and title when directive is first bound
                    el.classList.add('selectable-text');
                    el.setAttribute('title', 'Click to select');

                    // Create the click handler
                    const clickHandler = function (event) {
                        event.preventDefault();
                        event.stopPropagation();

                        const range = document.createRange();
                        range.selectNodeContents(this);
                        const selection = window.getSelection();
                        selection.removeAllRanges();
                        selection.addRange(range);
                    };

                    // Store the handler reference for cleanup
                    el.__click_handler = clickHandler;

                    // Add the event listener
                    el.addEventListener('click', clickHandler);
                },
                unbind(el) {
                    // Clean up the event listener when directive is unbound
                    if (el.__click_handler) {
                        el.removeEventListener('click', el.__click_handler);
                        delete el.__click_handler;
                    }
                }
            }
        },

        template: `

        <div class="app-container"> 

            <div v-if="false">
                <div class="loading-content">
                    <div class="loading-wrapper">
                        <h1>Welcome to AI Chat Watchs</h1>
                        <p>The report is loading, please wait...</p>
                        <div class="spinner-container">
                            <img src="data:image/gif;base64,R0lGODlhEAAQAPIAAP///wAAAMLCwkJCQgAAAGJiYoKCgpKSkiH/C05FVFNDQVBFMi4wAwEAAAAh/hpDcmVhdGVkIHdpdGggYWpheGxvYWQuaW5mbwAh+QQJCgAAACwAAAAAEAAQAAADMwi63P4wyklrE2MIOggZnAdOmGYJRbExwroUmcG2LmDEwnHQLVsYOd2mBzkYDAdKa+dIAAAh+QQJCgAAACwAAAAAEAAQAAADNAi63P5OjCEgG4QMu7DmikRxQlFUYDEZIGBMRVsaqHwctXXf7WEYB4Ag1xjihkMZsiUkKhIAIfkECQoAAAAsAAAAABAAEAAAAzYIujIjK8pByJDMlFYvBoVjHA70GU7xSUJhmKtwHPAKzLO9HMaoKwJZ7Rf8AYPDDzKpZBqfvwQAIfkECQoAAAAsAAAAABAAEAAAAzMIumIlK8oyhpHsnFZfhYumCYUhDAQxRIdhHBGqRoKw0R8DYlJd8z0fMDgsGo/IpHI5TAAAIfkECQoAAAAsAAAAABAAEAAAAzIIunInK0rnZBTwGPNMgQwmdsNgXGJUlIWEuR5oWUIpz8pAEAMe6TwfwyYsGo/IpFKSAAAh+QQJCgAAACwAAAAAEAAQAAADMwi6IMKQORfjdOe82p4wGccc4CEuQradylesojEMBgsUc2G7sDX3lQGBMLAJibufbSlKAAAh+QQJCgAAACwAAAAAEAAQAAADMgi63P7wCRHZnFVdmgHu2nFwlWCI3WGc3TSWhUFGxTAUkGCbtgENBMJAEJsxgMLWzpEAACH5BAkKAAAALAAAAAAQABAAAAMyCLrc/jDKSatlQtScKdceCAjDII7HcQ4EMTCpyrCuUBjCYRgHVtqlAiB1YhiCnlsRkAAAOwAAAAAAAAAAAA=="
                                alt="Loading..." />
                        </div>
                    </div>
                </div>
            </div>

            <div v-cloak>
                <div>
                    <component
                        v-for="obj in CURRENT_VISUAL_OBJECTS_ARRAY"                        
                        :is="obj.type"
                        :key="obj.id"
                        :obj="obj"
                    ></component>
                </div>
            </div>
        </div>        


            

        `,

    });

    window.app = app;   // Enable access to app methods from onclick handlers


    // Re-initialize the graphs (only for objects that have containers)
    app.CURRENT_VISUAL_OBJECTS_ARRAY.filter(obj => obj.type == 'graph-with-items').forEach(obj => {
        if (app[`filtered_${obj.id}`] && app[`filtered_${obj.id}`].length > 0) {
            app.init_graph(obj);
        }
    });

});
