/**
 * DomoContext - Represents the complete context of a single tab
 * Includes tab ID, URL, instance information, and the detected Domo object
 */
import { DomoObject } from './DomoObject.js';

export class DomoContext {
  /**
   * @param {number} tabId - The Chrome tab ID
   * @param {string} url - The full URL of the tab
   * @param {DomoObject} [domoObject] - The detected Domo object (optional)
   * @param {chrome.tabs.Tab} [tab] - The Chrome tab object (optional)
   * @param {{id: number, metadata: Object}} [user] - The current user (optional)
   */
  constructor(tabId, url, domoObject = null, tab = null, user = null) {
    this.tabId = tabId;
    this.url = url;
    this.tab = tab;
    this.user = user;
    this.userGroups = null;
    this.timestamp = Date.now();

    // Extract instance from URL
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      
      this.instance = hostname.includes('.domo.com')
        ? hostname.replace('.domo.com', '')
        : null;

      // Check if this is a valid Domo page
      this.isDomoPage = hostname.includes('.domo.com') && this.instance !== null;
    } catch (error) {
      console.error('[DomoContext] Error extracting instance from URL:', error);
      this.instance = null;
      this.isDomoPage = false;
    }

    this.domoObject = domoObject;
  }

  /**
   * Serialize to plain object for storage or message passing
   */
  toJSON() {
    return {
      tabId: this.tabId,
      url: this.url,
      instance: this.instance,
      isDomoPage: this.isDomoPage,
      domoObject: this.domoObject ? this.domoObject.toJSON() : null,
      user: this.user || null,
      userGroups: this.userGroups || null,
      timestamp: this.timestamp,
      tab: this.tab || null
    };
  }

  /**
   * Deserialize from plain object
   */
  static fromJSON(data) {
    if (!data) return null;

    const domoObject = data.domoObject
      ? DomoObject.fromJSON(data.domoObject)
      : null;

    const context = new DomoContext(
      data.tabId,
      data.url,
      domoObject,
      data.tab || null,
      data.user || null
    );

    context.userGroups = data.userGroups || null;
    context.timestamp = data.timestamp || Date.now();

    // Preserve isDomoPage if set
    if (Object.prototype.hasOwnProperty.call(data, 'isDomoPage')) {
      context.isDomoPage = data.isDomoPage;
    }

    return context;
  }
}
