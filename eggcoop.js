const eggCoopBaseURL = "https://eggcoop.org/api/contracts";

/**
 * Gets sorted list of contracts from EggCoop API
 * @returns {Promise<EggCoop.Contract[]>} Sorted array of contracts
 * @throws {Error} If fetching the contracts fails
 */
async function getEggCoopContractsList() {
	const contracts = await fetchEggCoopAPI(`/contracts`);
	console.log(contracts);
	const contractsSorted = contracts.sort((a, b) => {
		const dateA = new Date(a.startTime);
		const dateB = new Date(b.startTime);
		return dateA - dateB;
	});
	return contractsSorted.filter(
		(contract) => contract.contractIdentifier !== "first-contract"
	);
}

/**
 * Fetches EggCoop API data from a path
 * @param {string} path - path to fetch data from, starting with "/"
 * @returns {Promise<Object>} Data fetched from the path
 * @throws {Error} If the fetch fails
 */
async function fetchEggCoopAPI(path) {
	const params = {
		method: "get",
		headers: {
			Accept: "application/json",
		},
	};
	try {
		const response = await fetch(eggCoopBaseURL + path, params);
		return await response.json();
	} catch (error) {
		throw new Error(`Failed to fetch path: ${path}: ${error.message}`);
	}
}

/**
 * Gets contracts between two seasons
 * @param {string} startSeasonId - Season ID to start from (e.g. "winter_2025")
 * @param {string} endSeasonId - Season ID to end at (e.g. "spring_2025")
 * @param {boolean} [verbose=false] - Whether to log info to console
 * @returns {Promise<EggCoop.Contract[]>} Array of contracts between the specified seasons
 * @throws {Error} If fetching the contracts fails
 */
async function getSeasonalContracts(
	startSeasonId,
	endSeasonId,
	verbose = false
) {
	const sortedContracts = await getEggCoopContractsList();
	const seasonalContracts = [];

	// Time boundaries for filtering
	let seasonStartTime, seasonEndTime;

	// Find the time boundaries from the seasonal contracts
	for (const contract of sortedContracts) {
		// Find start time from first start season contract
		if (contract.season.eiSeasonId === startSeasonId && !seasonStartTime) {
			seasonStartTime = new Date(contract.startTime);
			if (verbose)
				console.log(`Found ${startSeasonId} start: ${seasonStartTime}`);
		}

		// Find end time from first end season contract
		if (contract.season.eiSeasonId === endSeasonId && !seasonEndTime) {
			seasonEndTime = new Date(contract.endTime);
			if (verbose)
				console.log(`Found ${endSeasonId} end: ${seasonEndTime}`);
			break;
		}
	}

	// Filter contracts that start within the boundaries
	for (const contract of sortedContracts) {
		const contractStartTime = new Date(contract.startTime);

		// Check if contract starts after our season start time
		if (seasonStartTime && contractStartTime >= seasonStartTime) {
			// Check if either there's no end time yet OR contract starts before end time
			if (!seasonEndTime || contractStartTime < seasonEndTime) {
				seasonalContracts.push(contract);
			}
		}
	}

	if (verbose) {
		console.log(`Found ${seasonalContracts.length} seasonal contracts`);
		if (seasonalContracts.length > 0) {
			console.log(
				`First seasonal contract: ${seasonalContracts[0].contractIdentifier}, starts at ${seasonalContracts[0].startTime}`
			);
			console.log(
				`Last seasonal contract: ${
					seasonalContracts[seasonalContracts.length - 1]
						.contractIdentifier
				}, starts at ${
					seasonalContracts[seasonalContracts.length - 1].startTime
				}`
			);
		}
	}

	return seasonalContracts;
}

/**
 * Gets the latest status of a specific coop
 * @param {string} kevID - The contract identifier
 * @param {string} coopCode - The coop's code
 * @param {boolean} [includeBuffHistory=false] - Whether to include buff history for every contributor.
 * @returns {Promise<EggCoop.Coop>} The coop data with latest status
 * @throws {Error} If fetching the coop data fails
 */
async function getEggCoopCoop(kevID, coopCode, includeBuffHistory = false) {
	const url = `/coops/${kevID}/${coopCode}/statuses/latest`;
	try {
		let coop = await fetchEggCoopAPI(url);
		if (includeBuffHistory) {
			coop = await addBuffHistory(coop);
		}
		return coop;
	} catch (error) {
		console.error(`Error fetching coop data: ${error.message}`);
		return {
			// In case of error return an empty yet still valid objet.
			status: "error",
			message: error.message,
			contract: kevID,
			coop: coopCode,
			contractIdentifier: kevID,
			coopContributors: [],
			totalAmount: 0,
		};
	}
}

/**
 * Adds grade specifications to the provided eggCoopContract.
 *
 * @param {EggCoop.Contract} eggCoopContract - An EggCoop contract object.
 * @returns {Promise<EggCoop.Contract>} Promise resolving to the egg coop contract object with gradeSpecs added.
 * @throws {Error} If fetching the grade specifications fails.
 */
async function addGradeSpecs(eggCoopContract) {
	try {
		const gradeSpecCollectionPath = eggCoopContract.gradeSpecCollection;

		// Check if the URL exists in the contract object
		if (!gradeSpecCollectionPath) {
			throw new Error("Grade specification collection URL is missing.");
		}

		// Fetch the grade specifications from the API asynchronously
		const gradeSpecs = await fetchEggCoopAPI(gradeSpecCollectionPath);

		// Check if the response contains the expected gradeSpecs field
		if (!gradeSpecs || !gradeSpecs.gradeSpecs) {
			throw new Error(
				"Failed to fetch grade specifications or invalid data structure."
			);
		}

		// Assign the grade specifications to the eggCoopContract
		eggCoopContract.gradeSpecs = gradeSpecs.gradeSpecs;

		return eggCoopContract;
	} catch (error) {
		// Throw the error with more context
		throw new Error(`Error adding grade specifications: ${error.message}`);
	}
}

/**
 * Adds buff history to each contributor in the provided EggCoop coop.
 * Includes a configurable delay between API calls to prevent rate limiting.
 *
 * @param {EggCoop.Coop} eggCoopCoop - An EggCoop coop object with coopContributors.
 * @param {number} [delayMs=100] - Delay in milliseconds between API calls.
 * @returns {Promise<EggCoop.Coop>} Promise resolving to the coop object with buff history added to each contributor.
 * @throws {Error} If fetching the contributor data or buff history fails.
 */
async function addBuffHistory(eggCoopCoop, delayMs = 100) {
	try {
		// Check if the coop object has coopContributors
		if (
			!eggCoopCoop ||
			!eggCoopCoop.coopContributors ||
			!Array.isArray(eggCoopCoop.coopContributors)
		) {
			throw new Error(
				"Invalid coop object or missing coopContributors array."
			);
		}

		// Helper function to delay execution
		const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

		// Process each contributor to add their buff history
		for (let i = 0; i < eggCoopCoop.coopContributors.length; i++) {
			const user = eggCoopCoop.coopContributors[i];
			let buffHistory = [];
			try {
				// Check if the contributor has a valid UUID
				if (!user.eiUuid) {
					console.warn(
						"Contributor missing eiUuid, skipping buff history fetch."
					);
					user.buffHistory = buffHistory;
					continue;
				}

				// Fetch the contributor data
				const contributorObject = await fetchEggCoopAPI(
					`/coop_contributor_uuids/${user.eiUuid}`
				);

				// Check if the response contains the expected buffHistory field
				if (
					!contributorObject ||
					contributorObject.buffHistory === undefined
				) {
					console.warn(
						`Failed to fetch buff history for user ${user.eiUuid} or invalid data structure.`
					);
					user.buffHistory = buffHistory;
					continue;
				}

				// Assign the buff history to the user
				user.buffHistory = contributorObject.buffHistory;

				// Add delay before the next request (except for the last item)
				if (i < eggCoopCoop.coopContributors.length - 1) {
					await delay(delayMs);
				}
			} catch (userError) {
				// Handle errors for individual users but continue processing others
				console.error(
					`Error fetching buff history for user ${user.eiUuid}: ${userError.message}`
				);
				user.buffHistory = buffHistory;
			}
		}

		return eggCoopCoop;
	} catch (error) {
		console.warn(`Error adding buff history: ${error.message}`);
		// Throw the error with more context
		for (let user of eggCoopCoop.coopContributors) {
			user.buffHistory = [];
		}
		return eggCoopCoop;
	}
}



// Export the functions
module.exports = {
	getEggCoopContractsList,
	getSeasonalContracts,
	fetchEggCoopAPI,
	getEggCoopCoop,
	addGradeSpecs,
	addBuffHistory,
};
