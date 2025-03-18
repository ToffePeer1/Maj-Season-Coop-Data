/**
 * Filters an array of cooperative objects to keep only the latest entry for each unique contract.
 * The latest entry is determined by the highest startTime value.
 * 
 * @param {Array<majCoopsObject>} coops - Array of majCoops objects, each containing at least contract and startTime properties
 * @returns {Array<majCoopsObject>} Array of unique majCoops objects with the latest startTime for each contract
 * @throws {Error} If coops is not an array or if required properties are missing
 */
function filterUniqueContracts(coops) {
    // Input validation
    if (!Array.isArray(coops)) {
        throw new Error('Input must be an array of cooperative objects');
    }

    // Create an object to store the latest entry for each contract
    const uniqueContracts = {};

    // Process each item in the input array
    for (const coop of coops) {
        // Validate coop object has required properties
        if (!coop || typeof coop !== 'object' || !('contract' in coop) || !('startTime' in coop)) {
            continue; // Skip invalid entries
        }

        const contract = coop.contract;
        
        // Ensure startTime is a number
        let currentStartTime;
        try {
            currentStartTime = parseInt(coop.startTime, 10);
            if (isNaN(currentStartTime)) {
                continue; // Skip entries with invalid startTime
            }
        } catch (error) {
            continue; // Skip entries with invalid startTime
        }

        // If we haven't seen this contract before, or this item has a higher startTime
        if (
            !uniqueContracts[contract] ||
            currentStartTime > parseInt(uniqueContracts[contract].startTime, 10)
        ) {
            uniqueContracts[contract] = coop;
        }
    }

    // Convert the object back to an array
    return Object.values(uniqueContracts);
}

/**
 * Fetches cooperative data for multiple contract IDs and returns only the latest entry for each unique contract.
 * 
 * @param {Array<string>} kevIDs - Array of contract identifiers to fetch
 * @returns {Promise<Array<majCoopsObject>>} Promise resolving to an array of unique cooperative objects
 * @throws {Error} If fetch fails, response is not valid JSON, or if kevIDs is not an array
 * @async
 */
async function getMajCoops(kevIDs) {
    // Input validation
    if (!Array.isArray(kevIDs)) {
        throw new Error('Input must be an array of contract identifiers');
    }

    // Verify that required environment variable is defined
    if (!process.env.MAJ_ENDPOINT) {
        throw new Error('Environment variable MAJ_ENDPOINT is not defined');
    }

    try {
        // Build endpoint URL with query parameters
        let endpointLink = process.env.MAJ_ENDPOINT;
        
        kevIDs.forEach((id, index) => {
            endpointLink += index === 0 ? '?' : '&';
            endpointLink += `contract=${encodeURIComponent(id)}`;
        });

        // Fetch data from the endpoint
        const response = await fetch(endpointLink);
        
        // Check if the fetch was successful
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        // Parse the JSON response
        const coops = await response.json();

        // Filter to keep only the highest startTime per unique contract
        const uniqueCoops = filterUniqueContracts(coops);

        // Only return coops where activeCoops is false and log the rest
        for (const coop of uniqueCoops) {
            if (coop.activeCoops === true) {
                console.log("Excluding: ", coop.contract, " because coops are still ongoing.");
            }
        }
        const activeUniqueCoops = uniqueCoops.filter(coop => !coop.activeCoops);
        return activeUniqueCoops;
    } catch (error) {
        throw new Error(`Failed to fetch coop data: ${error.message}`);
    }
}

// Export the functions for use in other modules
module.exports = {
    filterUniqueContracts,
    getMajCoops
};