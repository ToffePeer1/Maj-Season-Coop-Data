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
	progressBar,
	formatTime,
} = require("./tools");

const { getMajCoops } = require("./maj");

const fs = require("fs");
require("dotenv").config();

// Define these two variables to filter the contracts
// The starting season is inclusive, the ending season is exclusive
const startingSeason = "winter_2025";
const endingSeason = "spring_2025";

// Whether or not to clear the coops file before writing new coops
const clearCoopsFile = true;

// Number of coops to process before writing to file
const SAVE_INTERVAL = 50;

const coopListPath = "./files/coopList.json";
const contractListPath = "./files/contractList.json";
const coopsPath = "./files/coops.json";

/**
 * Processes coops in controlled batches with rate limiting
 *
 * @param {Array} coops - Array of majCoopsObjects to process
 * @param {Array} seasonalContracts - Array of contract data
 * @param {Array} existingCoops - Array of already processed coops
 * @param {Object} options - Configuration options
 * @param {number} options.maxParallel - Maximum number of parallel requests (default: 3)
 * @param {number} options.requestDelay - Delay between requests in ms (default: 500)
 * @param {number} options.batchDelay - Delay between batches in ms (default: 2000)
 * @param {boolean} options.includeBuffHistory - Whether to fetch buff history for users (default: false)
 * @param {number} options.buffHistoryDelay - Delay between buff history requests in ms (default: 300)
 * @returns {Promise<Array>} - Array of processed coop data
 */
async function processCoopsWithRateLimiting(
	coops,
	seasonalContracts,
	existingCoops,
	options = {}
) {
	const {
		maxParallel = 3,
		requestDelay = 500,
		batchDelay = 2000,
		includeBuffHistory = true,
		buffHistoryDelay = 300,
	} = options;

	console.log(`Starting to process coops with rate limiting:`);
	console.log(`- Max parallel requests: ${maxParallel}`);
	console.log(`- Delay between requests: ${requestDelay}ms`);
	console.log(`- Delay between batches: ${batchDelay}ms`);
	console.log(`- Include buff history: ${includeBuffHistory ? "Yes" : "No"}`);
	if (includeBuffHistory) {
		console.log(`- Buff history delay: ${buffHistoryDelay}ms`);
	}
	console.log(`- Saving progress every ${SAVE_INTERVAL} coops`);

	const processedCoops = [];
	let processedCount = 0;
	let totalCoopCount = 0;
	let totalUserCount = 0;
	let saveCounter = 0;

	// Count total number of coops for progress reporting
	coops.forEach((majCoopsObject) => {
		totalCoopCount += majCoopsObject.coops.length;
		
		// Count users in each coop
		majCoopsObject.coops.forEach((coop) => {
			totalUserCount += coop.users.length;
		});
	});

	console.log(`Total coops to process: ${totalCoopCount}`);
	console.log(`Total users: ${totalUserCount}`);

	// Initialize timing variables for ETA calculation
	const startTime = Date.now();
	let lastUpdateTime = startTime;
	let lastLineLength = 0;

	// Clear the console line
	const clearLine = () => {
		if (lastLineLength > 0) {
			process.stdout.write("\r" + " ".repeat(lastLineLength) + "\r");
		}
	};

	// Update progress bar
	const updateProgress = (current) => {
		const percent = (current / totalCoopCount) * 100;
		const elapsedSeconds = (Date.now() - startTime) / 1000;
		const averageTimePerCoop = elapsedSeconds / current;
		const remainingCoops = totalCoopCount - current;
		const estimatedRemainingSeconds = remainingCoops * averageTimePerCoop;

		const progressText = `${progressBar(
			percent
		)} ${current}/${totalCoopCount} coops | ETA: ${formatTime(
			estimatedRemainingSeconds
		)}`;
		clearLine();
		process.stdout.write("\r" + progressText);
		lastLineLength = progressText.length;
		lastUpdateTime = Date.now();
	};

	// Process majCoopsObjects sequentially
	for (const majCoopsObject of coops) {
		// Find the contract data for this coop
		const contractData = seasonalContracts.find(
			(c) => c.contractIdentifier === majCoopsObject.contract
		);
		if (!contractData) {
			console.warn(
				`\nContract data not found for ${majCoopsObject.contract}, skipping`
			);
			continue;
		}

		// Process coops in batches with parallel execution within each batch
		for (let i = 0; i < majCoopsObject.coops.length; i += maxParallel) {
			const batch = majCoopsObject.coops.slice(i, i + maxParallel);

			// Process the batch in parallel
			const batchPromises = batch.map(async (coop, index) => {
				// Add staggered delay within the batch to avoid simultaneous requests
				await new Promise((resolve) =>
					setTimeout(resolve, index * requestDelay)
				);

				try {
					// Pass the includeBuffHistory flag and buffHistoryDelay to getEggCoopCoop
					const eggCoopCoop = await getEggCoopCoop(
						majCoopsObject.contract,
						coop.code,
						includeBuffHistory,
						buffHistoryDelay
					);

					const fullCoopData = await handleCoop(
						eggCoopCoop,
						contractData,
						coop
					);
					processedCount++;
					saveCounter++;

					// Update progress bar
					updateProgress(processedCount);

					return fullCoopData;
				} catch (error) {
					clearLine();
					console.error(
						`\nError processing coop ${coop.code} for contract ${majCoopsObject.contract}:`,
						error
					);
					updateProgress(processedCount);
					return null;
				}
			});

			// Wait for all promises in the batch to resolve
			const batchResults = await Promise.all(batchPromises);

			// Add successful results to the processed coops array
			const validResults = batchResults.filter(
				(result) => result !== null
			);
			processedCoops.push(...validResults);

			// Periodically save progress
			if (saveCounter >= SAVE_INTERVAL && processedCoops.length > 0) {
				clearLine();
				console.log(
					`\nSaving progress (${processedCoops.length} new coops processed)...`
				);

				// Combine with existing coops and save
				const combinedCoops = [...existingCoops, ...processedCoops];
				fs.writeFileSync(
					coopsPath,
					JSON.stringify(combinedCoops, null, 2)
				);

				// Update existing coops to include what we've saved
				existingCoops = combinedCoops;

				// Clear the processed coops to free memory
				processedCoops.length = 0;
				saveCounter = 0;

				console.log(
					`Progress saved. Total coops so far: ${existingCoops.length}`
				);
				updateProgress(processedCount);
			}

			// Add delay between batches
			if (i + maxParallel < majCoopsObject.coops.length) {
				await new Promise((resolve) => setTimeout(resolve, batchDelay));
			}
		}
	}

	clearLine();
	console.log(
		`\nCompleted processing ${processedCount}/${totalCoopCount} coops.`
	);

	// Return the remaining processed coops that haven't been saved yet
	return processedCoops;
}

// Modify the part where the existing coops are read

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

		// Handle the clearCoopsFile option
		if (clearCoopsFile) {
			console.log(
				`clearCoopsFile is set to true. Starting with an empty coops file.`
			);

			// Create an empty file if it doesn't exist or clear the existing one
			fs.writeFileSync(coopsPath, JSON.stringify([], null, 2));
		} else {
			try {
				// Check if the file exists and has valid content
				if (fs.existsSync(coopsPath)) {
					const fileContent = fs.readFileSync(coopsPath, "utf8");
					if (fileContent.trim()) {
						existingCoops = JSON.parse(fileContent);
						console.log(
							`Loaded ${existingCoops.length} existing coops from ${coopsPath}`
						);
					} else {
						console.log(
							`${coopsPath} exists but is empty. Starting with an empty array.`
						);
					}
				} else {
					console.log(
						`${coopsPath} does not exist. Starting with an empty array.`
					);
				}
			} catch (error) {
				console.error(
					`Error reading existing coops from ${coopsPath}:`,
					error
				);
				console.log("Starting with an empty array.");
			}
		}

		// Process coops with rate limiting
		const remainingProcessedCoops = await processCoopsWithRateLimiting(
			coops,
			seasonalContracts,
			existingCoops,
			{
				maxParallel: 3, // Process 3 coops in parallel
				requestDelay: 500, // 500ms staggered delay between requests in a batch
				batchDelay: 2000, // 2 second delay between batches
				includeBuffHistory: true, // Enable buff history fetching
				buffHistoryDelay: 300, // 300ms delay between buff history requests
			}
		);

		// Save any remaining processed coops
		if (remainingProcessedCoops.length > 0) {
			const finalCombinedCoops = [
				...existingCoops,
				...remainingProcessedCoops,
			];
			fs.writeFileSync(
				coopsPath,
				JSON.stringify(finalCombinedCoops, null, 2)
			);
			console.log(
				`Final save: Added ${remainingProcessedCoops.length} coops to ${coopsPath}. Total coops: ${finalCombinedCoops.length}`
			);
		} else {
			console.log(
				`Processing complete. Total coops: ${existingCoops.length}`
			);
		}
	} catch (error) {
		console.error("Error:", error);
	}
}

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

		const gradeMultiplier =
			gradeMultipliers[gradeShortString.toLowerCase()];
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
				if (
					!gradeSpec.goalCollection ||
					!gradeSpec.goalCollection.goals ||
					!gradeSpec.goalCollection.goals.length
				) {
					throw new Error(
						`Invalid goal collection for grade ${coopGrade}`
					);
				}

				const goalsAmount = gradeSpec.goalCollection.goals.length;
				contractMainGoal =
					gradeSpec.goalCollection.goals[goalsAmount - 1]
						.targetAmount;

				if (!Number.isInteger(gradeSpec.lengthSeconds)) {
					throw new Error("Contract length must be an integer");
				}

				contractFarmMaximumTimeAllowedSeconds = gradeSpec.lengthSeconds;
				break;
			}
		}

		if (
			contractFarmMaximumTimeAllowedSeconds === null ||
			contractMainGoal === null
		) {
			throw new Error(
				`Could not find grade specification for grade ${coopGrade}`
			);
		}

		// Determine green scroll status
		const greenScroll =
			(eggCoopCoop.allGoalsAchieved === true &&
				eggCoopCoop.allMembersReporting === true) ||
			eggCoopCoop.gracePeriodSecondsRemaining === 0;

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
			throw new Error(
				`Failed to calculate coop duration: ${error.message}`
			);
		}

		// Calculate base points
		const basePoints =
			(1 + contractFarmMaximumTimeAllowedSeconds / 259200) *
			gradeMultiplier;

		// Process each user's data
		if (
			!eggCoopCoop.coopContributors ||
			!Array.isArray(eggCoopCoop.coopContributors)
		) {
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
					throw new Error(
						`Failed to calculate buff value: ${buffError.message}`
					);
				}

				// Calculate contribution metrics
				if (typeof user.contributionAmount !== "number") {
					throw new Error(
						`Invalid contribution amount for user ${
							user.userName || "unknown"
						}`
					);
				}

				const eggsShipped = user.contributionAmount;

				if (
					!Number.isInteger(contractMainGoal) ||
					!Number.isInteger(contract.maxCoopSize)
				) {
					throw new Error(
						"Contract main goal and max coop size must be integers"
					);
				}

				const contributionRatio =
					eggsShipped / (contractMainGoal / contract.maxCoopSize);

				let contributionFactor;
				try {
					contributionFactor =
						calculateContributionFactor(contributionRatio);
				} catch (factorError) {
					console.error(
						"Error calculating contribution factor:",
						factorError
					);
					throw new Error(
						`Failed to calculate contribution factor: ${factorError.message}`
					);
				}

				// Calculate time-related bonuses
				const completionTimeBonus =
					4 *
						Math.pow(
							1 -
								coopDurationSeconds /
									contractFarmMaximumTimeAllowedSeconds,
							3
						) +
					1;

				const timeToCompleteFactor =
					coopDurationSeconds / contractFarmMaximumTimeAllowedSeconds;

				// Calculate teamwork scores
				const B = Math.min(buffValue / coopDurationSeconds, 2);
				const teamworkScore = (5 * B) / 19;
				const teamWork = 0.19 * teamworkScore + 1;

				const upperTeamWorkScore = (5 * B + 6 + 10) / 19;
				const upperTeamWork = 0.19 * upperTeamWorkScore + 1;

				// Calculate final scores
				const cs =
					basePoints *
					contributionFactor *
					completionTimeBonus *
					teamWork *
					187.5;

				const upperCS =
					basePoints *
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
				console.error(
					`Error processing user data for ${
						user.userName || "unknown"
					}:`,
					userError
				);

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

main();
