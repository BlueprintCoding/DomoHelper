/**
 * DomoObject class represents a specific Domo object instance (Card, Page, Dataset, etc.)
 * Simplified version for DomoHelper focused on core functionality
 */
export class DomoObject {
  /**
   * @param {string} typeId - The object type identifier (PAGE, CARD, DATA_SOURCE, etc.)
   * @param {string} id - The object ID
   * @param {string} baseUrl - The base URL (e.g., https://instance.domo.com)
   * @param {Object} [metadata] - Optional metadata about the object
   * @param {string} [originalUrl] - Optional original URL for parent extraction
   * @param {string} [parentId] - Optional parent ID if already known
   */
  constructor(
    typeId,
    id,
    baseUrl,
    metadata = {},
    originalUrl = null,
    parentId = null
  ) {
    this.id = id;
    this.baseUrl = baseUrl;
    this.typeId = typeId;
    this.metadata = metadata;
    this.originalUrl = originalUrl;
    this.parentId = parentId;

    // Get type name from registry
    const typeInfo = DomoObjectType.registry[typeId];
    this.typeName = typeInfo ? typeInfo.name : typeId;

    // Build URL
    this.url = this.buildUrl(baseUrl, typeId, id, parentId, originalUrl);
  }

  /**
   * Build the URL for this object
   */
  buildUrl(baseUrl, typeId, id, parentId, originalUrl) {
    const typeInfo = DomoObjectType.registry[typeId];
    
    if (!typeInfo || !typeInfo.urlPath) {
      return null;
    }

    let url = typeInfo.urlPath.replace('{id}', id);
    
    if (url.includes('{parent}') && parentId) {
      url = url.replace('{parent}', parentId);
    }
    
    return `${baseUrl}${url}`;
  }

  /**
   * Serialize to plain object for storage or message passing
   */
  toJSON() {
    return {
      id: this.id,
      typeId: this.typeId,
      typeName: this.typeName,
      baseUrl: this.baseUrl,
      url: this.url,
      metadata: this.metadata,
      originalUrl: this.originalUrl,
      parentId: this.parentId
    };
  }

  /**
   * Deserialize from plain object
   */
  static fromJSON(data) {
    if (!data) return null;
    
    const domoObject = new DomoObject(
      data.typeId,
      data.id,
      data.baseUrl,
      data.metadata || {},
      data.originalUrl || null,
      data.parentId || null
    );
    
    if (data.url !== undefined) {
      domoObject.url = data.url;
    }
    
    return domoObject;
  }
}

/**
 * DomoObjectType configuration class
 */
export class DomoObjectTypeConfig {
  constructor(id, name, urlPath = null, idPattern = null, extractConfig = null) {
    this.id = id;
    this.name = name;
    this.urlPath = urlPath;
    this.idPattern = idPattern;
    this.extractConfig = extractConfig;
  }

  /**
   * Extract object ID from URL
   */
  extractObjectId(url) {
    if (!this.extractConfig) return null;
    
    const parts = url.split(/[/?=&]/);
    const { keyword, offset = 1, fromEnd = false } = this.extractConfig;
    
    if (fromEnd) {
      return parts[parts.length - offset] || null;
    }
    
    const index = parts.indexOf(keyword);
    return index !== -1 ? parts[index + offset] || null : null;
  }

  /**
   * Extract parent ID from URL
   */
  extractParentId(url) {
    if (!this.extractConfig?.parentExtract) return null;
    
    const parts = url.split(/[/?=&]/);
    const { keyword, offset = 1, fromEnd = false } = this.extractConfig.parentExtract;
    
    if (fromEnd) {
      return parts[parts.length - offset] || null;
    }
    
    const index = parts.indexOf(keyword);
    return index !== -1 ? parts[index + offset] || null : null;
  }
}

/**
 * DomoObjectType Registry - Comprehensive list of Domo object types
 * This is a simplified subset focusing on the most common types used by DomoHelper
 */
export const DomoObjectType = {
  registry: {
    PAGE: new DomoObjectTypeConfig('PAGE', 'Page', '/page/{id}', /^\d+$/, { keyword: 'page', offset: 1 }),
    ANALYZER: new DomoObjectTypeConfig('ANALYZER', 'Analyzer', '/analyzer?pageid={id}', /^-?\d+$/, { keyword: 'pageid', offset: 1 }),
    CARD: new DomoObjectTypeConfig('CARD', 'Card', '/kpis/{id}', /^\d+$/, { keyword: 'kpis', offset: 1 }),
    DATA_SOURCE: new DomoObjectTypeConfig('DATA_SOURCE', 'Data Source', '/datasources/{id}', /^[a-zA-Z0-9]+$/, { keyword: 'datasources', offset: 1 }),
    DATASET: new DomoObjectTypeConfig('DATASET', 'Dataset', '/datasources/{id}', /^[a-zA-Z0-9]+$/, { keyword: 'datasources', offset: 1 }),
    DATAFLOW: new DomoObjectTypeConfig('DATAFLOW', 'Dataflow', '/dataflows/{id}', /^\d+$/, { keyword: 'dataflows', offset: 1 }),
    DATAFLOW_TYPE: new DomoObjectTypeConfig('DATAFLOW_TYPE', 'Dataflow', '/dataflows/{id}', /^\d+$/, { keyword: 'dataflows', offset: 1 }),
    USER: new DomoObjectTypeConfig('USER', 'User', '/up/{id}', /^\d+$/, { keyword: 'up', offset: 1 }),
    GROUP: new DomoObjectTypeConfig('GROUP', 'Group', '/groups/{id}', /^\d+$/, { keyword: 'groups', offset: 1 }),
    WORKFLOW_MODEL: new DomoObjectTypeConfig('WORKFLOW_MODEL', 'Workflow', '/workflows/{id}', /^\d+$/, { keyword: 'workflows', offset: 1 }),
    UNPUBLISHED_DATAFLOW: new DomoObjectTypeConfig('UNPUBLISHED_DATAFLOW', 'Unpublished Dataflow', '/datasources/{id}', /^[a-zA-Z0-9]+$/, { keyword: 'datasources', offset: 1 }),
    MAGIC_ETL: new DomoObjectTypeConfig('MAGIC_ETL', 'Magic ETL', '/datasources/{id}', /^[a-zA-Z0-9]+$/, { keyword: 'datasources', offset: 1 }),
    DRILL_VIEW: new DomoObjectTypeConfig('DRILL_VIEW', 'Drill View', '/kpis/{id}', /^\d+$/, { keyword: 'kpis', offset: 1 }),
    ALERT: new DomoObjectTypeConfig('ALERT', 'Alert', '/alerts/{id}', /^\d+$/, { keyword: 'alerts', offset: 1 }),
    ROLE: new DomoObjectTypeConfig('ROLE', 'Role', '/admin/roles/{id}', /^\d+$/, { keyword: 'roles', offset: 1 }),
    BEAST_MODE_FORMULA: new DomoObjectTypeConfig('BEAST_MODE_FORMULA', 'Beast Mode', null, null),
    DATA_APP: new DomoObjectTypeConfig('DATA_APP', 'Data App', '/app-studio/{id}', /^\d+$/, { keyword: 'app-studio', offset: 1 }),
    DATA_APP_VIEW: new DomoObjectTypeConfig('DATA_APP_VIEW', 'Data App View', '/app-studio/{parent}/pages/{id}', /^\d+$/, { keyword: 'pages', offset: 1, parentExtract: { keyword: 'app-studio', offset: 1 } }),
    WORKSHEET_VIEW: new DomoObjectTypeConfig('WORKSHEET_VIEW', 'Worksheet', '/app-studio/{parent}/pages/{id}', /^\d+$/, { keyword: 'pages', offset: 1, parentExtract: { keyword: 'app-studio', offset: 1 } }),
    CODE_ENGINE: new DomoObjectTypeConfig('CODE_ENGINE', 'Code Engine', null, null),
    CODEENGINE_PACKAGE: new DomoObjectTypeConfig('CODEENGINE_PACKAGE', 'Code Engine Package', null, null),
    CODEENGINE_PACKAGE_VERSION: new DomoObjectTypeConfig('CODEENGINE_PACKAGE_VERSION', 'Code Engine Package Version', null, null),
    WORKFLOW_MODEL_VERSION: new DomoObjectTypeConfig('WORKFLOW_MODEL_VERSION', 'Workflow Version', '/workflows/{id}', /^\d+$/, { keyword: 'workflows', offset: 1 }),
    UNKNOWN: new DomoObjectTypeConfig('UNKNOWN', 'Unknown', null, null)
  },

  /**
   * Get a type configuration by ID
   */
  get(typeId) {
    return this.registry[typeId] || this.registry.UNKNOWN;
  },

  /**
   * Check if a type ID is valid
   */
  isValid(typeId) {
    return typeId in this.registry;
  }
};
