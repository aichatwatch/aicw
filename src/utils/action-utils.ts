import { getModuleNameFromUrl } from "./misc-utils.js";
import { PipelineCriticalError } from "./pipeline-errors.js";
import { logger } from "./compact-logger.js";
const CURRENT_MODULE_NAME = getModuleNameFromUrl(import.meta.url);

export function filterSectionsToProcess(inSections: readonly string[], excludeSections: string[], includeSections: string[]): string[]{  
    const result: string[] = inSections.filter(sectionName => {
        if (excludeSections.length > 0 && excludeSections.includes(sectionName)) {
        logger.info(`  └─ Section '${sectionName}': Skipping because it is in SECTIONS_TO_EXCLUDE: ${excludeSections.join(', ')}`);
        return false;
        }
        else if (includeSections.length > 0 && !includeSections.includes(sectionName)) {
        logger.info(`  └─ Section '${sectionName}': Skipping because it is NOT in SECTIONS_TO_INCLUDE: ${includeSections.join(', ')}`);
        return false;
        }
        return true;
    });
    if(result.length === 0) {
        throw new PipelineCriticalError(
        `No sections to process because all are in SECTIONS_TO_EXCLUDE or SECTIONS_TO_INCLUDE`,
        CURRENT_MODULE_NAME,
        'filterSectionsToProcess'
        );
    }
    return result;
}