const {
	getEggCoopContractsList,
	getSeasonalContracts,
	fetchEggCoopAPI,
	addGradeSpecs,
	getEggCoopCoop,
} = require("./eggcoop");

const {
	calculateBuffTimeValue,
	getCoopDuration,
	calculateContributionFactor,
} = require("./tools");

const { getMajCoops } = require("./maj");

const fs = require("fs");
require("dotenv").config();

// Define these two variables to filter the contracts
// The starting season is inclusive, the ending season is exclusive
const startingSeason = "winter_2025";
const endingSeason = "spring_2025";

const coopListPath = "./files/coopList.json";
const contractListPath = "./files/contractList.json";
const coopsPath = "./files/coops.json";

async function main() {
	try {
		// Get all contracts
		const allContracts = await getEggCoopContractsList();
		console.log(`Total contracts: ${allContracts.length}`);

		// Get seasonal contracts
		const seasonalContracts = await getSeasonalContracts(
			startingSeason,
			endingSeason,
			true
		);
		console.log(
			`${startingSeason} to ${endingSeason} contracts: ${seasonalContracts.length}`
		);

		const seasonalKevIDs = seasonalContracts.map(
			(contract) => contract.contractIdentifier
		);

		const coops = await getMajCoops(seasonalKevIDs);
		console.log(`Total contracts after filtering: ${coops.length}`);

		// Log the list of unique kevIDs in coops, defined by coops[i].contract
		const uniqueKevIDs = coops.map((coop) => coop.contract);
		// console.log(`Unique kevIDs in coops:\n${JSON.stringify(uniqueKevIDs, null, 2)}`);

		// Write the contracts to contractListPath
		fs.writeFileSync(
			contractListPath,
			JSON.stringify(seasonalContracts, null, 2)
		);
		console.log(`Contract list written to ${contractListPath}`);

		// Write the coops to coopListPath
		fs.writeFileSync(coopListPath, JSON.stringify(coops, null, 2));
		console.log(`Coop list written to ${coopListPath}`);

		// Create or read the existing coops array
		let existingCoops = [];
		try {
			// Check if the file exists and has valid content
			if (fs.existsSync(coopsPath)) {
				const fileContent = fs.readFileSync(coopsPath, 'utf8');
				if (fileContent.trim()) {
					existingCoops = JSON.parse(fileContent);
					console.log(`Loaded ${existingCoops.length} existing coops from ${coopsPath}`);
				} else {
					console.log(`${coopsPath} exists but is empty. Starting with an empty array.`);
				}
			} else {
				console.log(`${coopsPath} does not exist. Starting with an empty array.`);
			}
		} catch (error) {
			console.error(`Error reading existing coops from ${coopsPath}:`, error);
			console.log("Starting with an empty array.");
		}

		
		// Uncomment this section to process all coops
		// Initialize an array to hold all processed coops
		const processedCoops = [];
		
		// Process each coop
		let processedCount = 0;
		for (const majCoopsObject of coops) {
			// Find the contract data for this coop
			const contractData = seasonalContracts.find(c => c.contractIdentifier === majCoopsObject.contract);
			if (!contractData) {
				console.warn(`Contract data not found for ${majCoopsObject.contract}, skipping`);
				continue;
			}
			
			for (const coop of majCoopsObject.coops) {
				try {
					const eggCoopCoop = await getEggCoopCoop(majCoopsObject.contract, coop.code);
					const fullCoopData = await handleCoop(eggCoopCoop, contractData, coop);
					processedCoops.push(fullCoopData);
					processedCount++;
					
					// Optional: Add a delay between API calls to avoid rate limiting
					// await new Promise(resolve => setTimeout(resolve, 100));
				} catch (error) {
					console.error(`Error processing coop ${coop.code} for contract ${majCoopsObject.contract}:`, error);
				}
			}
		}
		
		// Combine with existing coops
		const combinedCoops = [...existingCoops, ...processedCoops];
		
		// Write all processed coops to the output file
		fs.writeFileSync(coopsPath, JSON.stringify(combinedCoops, null, 2));
		console.log(`Added ${processedCount} coops to ${coopsPath}. Total coops: ${combinedCoops.length}`);
		

	} catch (error) {
		console.error("Error:", error);
	}
}

main();

/**
 * Handles coop data processing and calculates scoring metrics for each user in the coop.
 * 
 * @param {Object} eggCoopCoop - The egg coop data containing contributors and achievement status.
 * @param {Object} contract - The contract information potentially requiring grade specifications.
 * @param {Object} majCoopCoop - The major coop data containing grade information.
 * @returns {Promise<Object>} The processed output containing coop, contract, and user data.
 * @throws {Error} If critical data is missing or processing fails.
 */
async function handleCoop(eggCoopCoop, contract, majCoopCoop) {
    try {
        // Validate inputs
        if (!eggCoopCoop) throw new Error("Missing egg coop data");
        if (!contract) throw new Error("Missing contract data");
        if (!majCoopCoop) throw new Error("Missing major coop data");
        
        // Add grade specs if needed
        if (!contract.gradeSpecs) {
            try {
                contract = await addGradeSpecs(contract);
            } catch (error) {
                console.error("Failed to add grade specs:", error);
                throw new Error(`Failed to add grade specs: ${error.message}`);
            }
        }
        
        let output = {
            coopData: eggCoopCoop,
            contractData: contract,
            majCoopData: majCoopCoop,
            userData: [],
        };

        // Process grade information
        if (!majCoopCoop.grade) {
            throw new Error("Missing grade information in majCoopCoop");
        }
        
        const gradeShortString = majCoopCoop.grade;
        const coopGrade = "GRADE_" + gradeShortString.toUpperCase();

        const gradeMultipliers = {
            aaa: 7,
            aa: 5,
            a: 3.5,
            b: 2,
            c: 1,
        };
        
        const gradeMultiplier = gradeMultipliers[gradeShortString.toLowerCase()];
        if (!gradeMultiplier) {
            throw new Error(`Unknown grade: ${gradeShortString}`);
        }

        // Extract contract specifications
        let contractFarmMaximumTimeAllowedSeconds = null;
        let contractMainGoal = null;

        // Find the appropriate grade specification
        const gradeSpecs = contract.gradeSpecs || [];
        for (const gradeSpec of gradeSpecs) {
            if (gradeSpec.grade && gradeSpec.grade.eiIdentifier === coopGrade) {
                if (!gradeSpec.goalCollection || !gradeSpec.goalCollection.goals || !gradeSpec.goalCollection.goals.length) {
                    throw new Error(`Invalid goal collection for grade ${coopGrade}`);
                }
                
                const goalsAmount = gradeSpec.goalCollection.goals.length;
                contractMainGoal = gradeSpec.goalCollection.goals[goalsAmount - 1].targetAmount;
                
                if (!Number.isInteger(gradeSpec.lengthSeconds)) {
                    throw new Error("Contract length must be an integer");
                }
                
                contractFarmMaximumTimeAllowedSeconds = gradeSpec.lengthSeconds;
                break;
            }
        }

        if (contractFarmMaximumTimeAllowedSeconds === null || contractMainGoal === null) {
            throw new Error(`Could not find grade specification for grade ${coopGrade}`);
        }

        // Determine green scroll status
        const greenScroll = (
            (eggCoopCoop.allGoalsAchieved === true && 
            eggCoopCoop.allMembersReporting === true) ||
            eggCoopCoop.gracePeriodSecondsRemaining === 0
        );

        // Calculate coop duration
        let coopDurationSeconds;
        try {
            coopDurationSeconds = getCoopDuration(
                eggCoopCoop,
                contractFarmMaximumTimeAllowedSeconds,
                contractMainGoal
            );
        } catch (error) {
            console.error("Error calculating coop duration:", error);
            throw new Error(`Failed to calculate coop duration: ${error.message}`);
        }

        // Calculate base points
        const basePoints = (1 + contractFarmMaximumTimeAllowedSeconds / 259200) * gradeMultiplier;

        // Process each user's data
        if (!eggCoopCoop.coopContributors || !Array.isArray(eggCoopCoop.coopContributors)) {
            throw new Error("Missing or invalid coop contributors");
        }

        for (const user of eggCoopCoop.coopContributors) {
            try {
                if (!user) {
                    console.warn("Skipping undefined user");
                    continue;
                }

                // Calculate buff value
				const buffHistory = user.buffHistory || [];
                let buffValue;
                try {
                    buffValue = calculateBuffTimeValue(
                        buffHistory,
                        eggCoopCoop.secondsSinceAllGoalsAchieved || 0
                    );
                } catch (buffError) {
                    console.error("Error calculating buff value:", buffError);
                    throw new Error(`Failed to calculate buff value: ${buffError.message}`);
                }

                // Calculate contribution metrics
                if (typeof user.contributionAmount !== 'number') {
                    throw new Error(`Invalid contribution amount for user ${user.userName || 'unknown'}`);
                }
                
                const eggsShipped = user.contributionAmount;
                
                if (!Number.isInteger(contractMainGoal) || !Number.isInteger(contract.maxCoopSize)) {
                    throw new Error("Contract main goal and max coop size must be integers");
                }
                
                const contributionRatio = eggsShipped / (contractMainGoal / contract.maxCoopSize);
                
                let contributionFactor;
                try {
                    contributionFactor = calculateContributionFactor(contributionRatio);
                } catch (factorError) {
                    console.error("Error calculating contribution factor:", factorError);
                    throw new Error(`Failed to calculate contribution factor: ${factorError.message}`);
                }

                // Calculate time-related bonuses
                const completionTimeBonus = 
                    4 * 
                    Math.pow(
                        (1 - coopDurationSeconds / contractFarmMaximumTimeAllowedSeconds), 
                        3
                    ) + 1;
                    
                const timeToCompleteFactor = 
                    coopDurationSeconds / contractFarmMaximumTimeAllowedSeconds;

                // Calculate teamwork scores
                const B = Math.min(buffValue / coopDurationSeconds, 2);
                const teamworkScore = (5 * B) / 19;
                const teamWork = 0.19 * teamworkScore + 1;
                
                const upperTeamWorkScore = (5 * B + 6 + 10) / 19;
                const upperTeamWork = 0.19 * upperTeamWorkScore + 1;

                // Calculate final scores
                const cs = basePoints * 
                    contributionFactor * 
                    completionTimeBonus * 
                    teamWork * 
                    187.5;
                    
                const upperCS = basePoints * 
                    contributionFactor * 
                    completionTimeBonus * 
                    upperTeamWork * 
                    187.5;

                // Add user data to output
                output.userData.push({
                    eiUuid: user.eiUuid || "unknown",
                    userName: user.userName || "unknown",
                    eggsShipped,
                    contributionRatio,
                    contributionFactor,
                    completionTimeBonus,
                    timeToCompleteFactor,
                    greenScroll,
					buffHistory,
                    buffValue,
                    teamWork,
                    upperTeamWork,
                    cs,
                    upperCS,
                });
            } catch (userError) {
                console.error(`Error processing user data for ${user.userName || 'unknown'}:`, userError);
                
                // Add error record for this user
                output.userData.push({
                    eiUuid: user.eiUuid || "unknown",
                    userName: user.userName || "unknown",
                    error: userError.message,
                    eggsShipped: user.contributionAmount || 0,
                    contributionRatio: 0,
                    contributionFactor: 0,
                    completionTimeBonus: 1,
                    timeToCompleteFactor: 1,
                    greenScroll,
					buffHistory: [],
                    buffValue: 0,
                    teamWork: 1,
                    upperTeamWork: 1,
                    cs: 0,
                    upperCS: 0,
                });
            }
        }

        return output;
    } catch (error) {
        console.error("Critical error in handleCoop:", error);
        // Return a structured error response
        return {
            error: error.message,
            coopData: eggCoopCoop || {},
            contractData: contract || {},
            majCoopData: majCoopCoop || {},
            userData: [],
        };
    }
}