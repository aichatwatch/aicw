/**
 * Shared utilities for entity enrichment operations
 * Used by both link generation and similar term generation
 */

import { logger } from './compact-logger.js';
import { extractDomainFromUrl } from '../utils/url-utils.js';
import { PipelineCriticalError } from './pipeline-errors.js';
/**
 * Entity interface for enrichment operations
 */
export interface Entity {
  id: number;
  type: string;
  value: string;
  similar?: string;
  link?: string;
  sectionName: string;
  originalIndex: number;
}

/**
 * Check if an entity needs enrichment for a specific attribute
 *
 * @param entity - The entity to check
 * @param attrName - The attribute name to check (e.g., 'similar', 'link')
 * @returns true if the entity needs enrichment for this attribute
 */
export function needsToEnrichAttribute(entity: any, attrName: string): boolean {
  // Entity needs enrichment if:
  // 1. Has no attribute field at all
  // 2. Has an empty attribute field
  // 3. Has an attribute field with only whitespace
  // 4. Attribute is not a string type
  return !entity[attrName] ||
          typeof entity[attrName] !== 'string' ||
          entity[attrName].trim() === '';
}

/**
 * Extract the value from an entity (handles different field names)
 *
 * @param entity - The entity to extract value from
 * @returns The entity's value string
 */
export function getEntityValue(entity: any): string {
  return entity.value || entity.name || entity.keyword || entity.title || entity.label || entity.text || entity.link || '';
}

/**
 * Collect all entities that need enrichment for a specific attribute from specified sections
 *
 * @param data - The data object containing sections
 * @param SECTIONS - Array of section names to process
 * @param attrName - The attribute name to enrich (e.g., 'similar', 'link')
 * @returns Array of entities that need enrichment
 */
export function collectEntitiesForEnrichment(data: any, SECTIONS: string[], attrName: string): Entity[] {
  const entities: Entity[] = [];
  let globalId = 1;

  // Process specified sections
  for (const sectionName of SECTIONS) {
    // Skip if section doesn't exist or isn't an array
    if (!data[sectionName] || !Array.isArray(data[sectionName])) {
      logger.debug(`Skipping section '${sectionName}' - not an array`);
      continue;
    }

    // Collect entities that need enrichment
    const entitiesInSection: Entity[] = [];
    data[sectionName].forEach((entity: any, index: number) => {
      const entityValue = getEntityValue(entity);
      if (entityValue && needsToEnrichAttribute(entity, attrName)) {
        const enrichEntity: Entity = {
          id: globalId++,
          type: entity.type,
          value: entityValue,
          link: entity.link,
          similar: entity.similar,
          sectionName: sectionName,
          originalIndex: index
        };
        entities.push(enrichEntity);
        entitiesInSection.push(enrichEntity);
      }
    });

    // Log section processing info at INFO level (not DEBUG)
    const totalInSection = data[sectionName].length;
    const needsEnrichment = entitiesInSection.length;

    if (totalInSection > 0) {
      if (needsEnrichment > 0) {
        logger.info(`  └─ Section '${sectionName}': ${needsEnrichment}/${totalInSection} entities need '${attrName}' enrichment`);
      } else {
        logger.info(`  └─ Section '${sectionName}': 0/${totalInSection} entities need '${attrName}' enrichment (all already have ${attrName})`);
      }
    }
  }

  return entities;
}

// trying to predict some values for functions if any
// for example, we can predict links if link = value without spaces + .com/.org/.ai
export function predictAttributeValueForEntities(data: any, entities: Entity[], attrName: string): Entity[] 
{
  // trying to predict "link" value if we have "links" section which is not empty
  const DOMAIN_ENDINGS = ['.com', '.org', '.ai', '.io'];
  const result: Entity[] = [];
  let predictedLinksCount = 0;
  // processing ATTRIBUTE_NAME as "link"
  if(attrName == 'link' && data['links'] && data['links'].length > 0)
  {
    // get all domains mentioned from "links" array
    const linkItems = data['links'].map((item: any) => extractDomainFromUrl(item.value.toLowerCase()));
    const linkItemsSet = new Set(linkItems);
    if(linkItems.length > 0){
      for(const e of entities){
        if(e.value && e.value.length>0 && !e.link){
          const predictedLink = e.value.replace(/ /g, '').toLowerCase();
          // going through domain endings
          for(const domainEnding of DOMAIN_ENDINGS){
            // if check if we hav this domain like "somestring" + domain ending
            const suggestedLink = predictedLink + domainEnding;
            // check if we have this domain in our domains list from "links"
            if(linkItemsSet.has(suggestedLink))
            {
              // because we have this domain in our domains list from "links"
              // so we can use it as a link for prediction!
              e.link = suggestedLink;
              result.push(e);
              logger.info(`predictAttributeValueForEntities: predicted link value for "${e.value}" in "${e.sectionName}" section: ${e.link}`);
              predictedLinksCount++;
              break;
            }
          }
        }
      }
    }
    logger.info(`predictAttributeValueForEntities: predicted ${result.length} values for "${attrName}" attribute`);
  }
  // NO OTHER TYPES ARE SUPPORTED YET
  else {
    throw new PipelineCriticalError(
      `No support for predicting "${attrName}" value`,
      'predictAttributeValueForEntities'
    );
  }
  // return entities with predicted values (if any)
  return result;
}

/**
 * Collect entities from a SINGLE section only (not all sections)
 * Used for section-by-section enrichment processing
 *
 * @param data - The data object containing all sections
 * @param sectionName - The specific section to collect from (e.g., 'keywords', 'places')
 * @param attrName - The attribute to check for enrichment need (e.g., 'link', 'similar')
 * @returns Array of entities from this section that need enrichment
 */
export function collectEntitiesForSection(
  data: any,
  sectionName: string,
  attrName: string
): Entity[] {
  const entities: Entity[] = [];

  // Skip if section doesn't exist or isn't an array
  if (!data[sectionName] || !Array.isArray(data[sectionName])) {
    logger.debug(`Section '${sectionName}' does not exist or is not an array`);
    return entities;
  }

  let globalId = 1;

  // Collect entities from this section that need enrichment
  data[sectionName].forEach((item: any, index: number) => {
    const entityValue = getEntityValue(item);
    if (entityValue && needsToEnrichAttribute(item, attrName)) {
      entities.push({
        id: globalId++,
        type: item.type || sectionName.slice(0, -1), // Remove plural 's' if no type specified
        value: entityValue,
        link: item.link,
        similar: item.similar,
        sectionName: sectionName,
        originalIndex: index
      });
    }
  });

  return entities;
}

/**
 * Get total number of entities in a section
 * Used for logging and statistics
 *
 * @param data - The data object containing all sections
 * @param sectionName - The section name
 * @returns Number of entities in this section
 */
export function getTotalInSection(data: any, sectionName: string): number {
  if (!data[sectionName] || !Array.isArray(data[sectionName])) {
    return 0;
  }
  return data[sectionName].length;
}
