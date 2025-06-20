const eggCoopBaseURL = "https://eggcoop.org";

/**
 * Gets sorted list of contracts from EggCoop API
 * @returns {Promise<EggCoop.Contract[]>} Sorted array of contracts
 * @throws {Error} If fetching the contracts fails
 */
async function getEggCoopContractsList() {
	const contracts = await fetchEggCoopAPI(`/contracts`);
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
 * Fetches data from the EggCoop API with proper path handling
 * @param {string} path - Path to fetch data from (with or without "/api/" prefix)
 * @returns {Promise<Object>} Data fetched from the path
 * @throws {Error} If the path is invalid or the fetch fails
 */
async function fetchEggCoopAPI(path) {
	// Input validation
	if (!path || path.trim().length === 0) {
		throw new Error("Invalid API path: Path cannot be empty or undefined.");
	}

	// Normalize the path to ensure proper format
	path = path.replace(/^\/?api\/?/, "/api/"); // Normalize "api/" to "/api/"
	if (!path.startsWith("/api/")) {
		path = "/api/" + path.replace(/^\/+/, ""); // Remove any leading slashes before appending
	}

	const url = eggCoopBaseURL + path;
	const params = {
		method: "get",
		headers: {
			Accept: "application/json",
		},
	};

	try {
		const response = await fetch(url, params);
		if (!response.ok) {
			throw new Error(`HTTP error! Status: ${response.status}`);
		}
		return await response.json();
	} catch (error) {
		throw new Error(`Failed to fetch URL: ${url}: ${error.message}`);
	}
}
/**
 * Gets contracts between two dates
 * @param {Date|string} startDate - Start date to filter contracts (inclusive)
 * @param {Date|string} endDate - End date to filter contracts (inclusive)
 * @param {string} [seasonId=null] - If left empty, all contracts between the dates are returned. If specified, only contracts with the entered season ID are returned.
 * @param {boolean} [verbose=false] - Whether to log info to console
 * @returns {Promise<EggCoop.Contract[]>} Array of contracts between the specified dates
 * @throws {Error} If fetching the contracts fails or if date parameters are invalid
 */
async function getContractsByDate(
	startDate,
	endDate,
	seasonId = null,
	verbose = false
) {
	// Validate and convert date parameters
	const start = startDate instanceof Date ? startDate : new Date(startDate);
	const end = endDate instanceof Date ? endDate : new Date(endDate);

	// Validate date conversion was successful
	if (isNaN(start.getTime()) || isNaN(end.getTime())) {
		throw new Error("Invalid date format provided");
	}

	// Set end time to the end of the day to make the end date inclusive
	end.setHours(23, 59, 59, 999);

	if (verbose) {
		console.log(
			`Filtering contracts between: ${start.toISOString()} and ${end.toISOString()}`
		);
	}

	const sortedContracts = await getEggCoopContractsList();
	const filteredContracts = [];

	// Filter contracts that start within the date range
	for (const contract of sortedContracts) {
		const contractStartTime = new Date(contract.startTime);

		// Check if contract starts within our date range (inclusive on both ends)
		if (contractStartTime >= start && contractStartTime <= end) {
			if (seasonId && !!contract.season) {
				if (contract.season.eiSeasonId === seasonId) {
					filteredContracts.push(contract);
				}
			} else {
				filteredContracts.push(contract);
			}
		}
	}

	if (verbose) {
		console.log(
			`Found ${filteredContracts.length} contracts within date range`
		);
		if (filteredContracts.length > 0) {
			console.log(
				`First filtered contract: ${filteredContracts[0].contractIdentifier}, starts at ${filteredContracts[0].startTime}`
			);
			console.log(
				`Last filtered contract: ${
					filteredContracts[filteredContracts.length - 1]
						.contractIdentifier
				}, starts at ${
					filteredContracts[filteredContracts.length - 1].startTime
				}`
			);
		}
	}

	return filteredContracts;
}


/**
 * Gets contracts between two seasons
 * @param {string} startSeasonId - Season ID to start from (e.g. "winter_2025")
 * @param {string} endSeasonId - Season ID to end at (e.g. "spring_2025")
 * @param {boolean} [seasonalOnly=false] - Whether to include only seasonal contracts, or all contracts in between given seasons
 * @param {boolean} [verbose=false] - Whether to log info to console
 * @returns {Promise<EggCoop.Contract[]>} Array of contracts between the specified seasons
 * @throws {Error} If fetching the contracts fails
 */
async function getSeasonContracts(
	startSeasonId,
	endSeasonId,
	seasonalOnly = false,
	verbose = false
) {
	const sortedContracts = await getEggCoopContractsList();
	const seasonalContracts = [];

	// Time boundaries for filtering
	let seasonStartTime, seasonEndTime;

	// Find the time boundaries from the seasonal contracts
	for (const contract of sortedContracts) {
		try {
			// Find start time from first start season contract
			if (
				contract.season.eiSeasonId === startSeasonId &&
				!seasonStartTime
			) {
				seasonStartTime = new Date(contract.startTime);
				if (verbose)
					console.log(
						`Found ${startSeasonId} start: ${seasonStartTime}`
					);
			}

			// Find end time from first end season contract
			if (contract.season.eiSeasonId === endSeasonId && !seasonEndTime) {
				seasonEndTime = new Date(contract.endTime);
				if (verbose)
					console.log(`Found ${endSeasonId} end: ${seasonEndTime}`);
				break;
			}
		} catch (error) {
			console.log(contract);
		}
	}

	// Filter contracts that start within the boundaries
	for (const contract of sortedContracts) {
		if (seasonalOnly) {
			if (contract.season.eiSeasonId == startSeasonId) {
				seasonalContracts.push(contract);
			}
		} else {
			const contractStartTime = new Date(contract.startTime);

			// Check if contract starts after our season start time
			if (seasonStartTime && contractStartTime >= seasonStartTime) {
				// Check if either there's no end time yet OR contract starts before end time
				if (!seasonEndTime || contractStartTime < seasonEndTime) {
					seasonalContracts.push(contract);
				}
			}
		}
	}

	if (verbose) {
		console.log(
			`Found ${seasonalContracts.length}${
				seasonalOnly ? " seasonal" : ""
			} contracts`
		);
		if (seasonalContracts.length > 0) {
			console.log(
				`First${seasonalOnly ? " seasonal" : ""} contract: ${
					seasonalContracts[0].contractIdentifier
				}, starts at ${seasonalContracts[0].startTime}`
			);
			console.log(
				`Last${seasonalOnly ? " seasonal" : ""} contract: ${
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
 * @param {number} [buffHistoryDelay=100] - Delay between buff history requests in ms.
 * @returns {Promise<EggCoop.Coop>} The coop data with latest status
 * @throws {Error} If fetching the coop data fails
 */
async function getEggCoopCoop(
	kevID,
	coopCode,
	includeBuffHistory = false,
	buffHistoryDelay = 100
) {
	const url = `/coops/${kevID}/${coopCode}/statuses/latest`;
	try {
		let coop = await fetchEggCoopAPI(url);
		if (includeBuffHistory) {
			coop = await addBuffHistory(coop, buffHistoryDelay);
		}
		return coop;
	} catch (error) {
		console.error(`Error fetching coop data: ${error.message}`);
		return {
			// In case of error return an empty yet still valid object.
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
				// Check if the contributor has a valid eiUuid
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
	getContractsByDate,
	fetchEggCoopAPI,
	getEggCoopCoop,
	addGradeSpecs,
	addBuffHistory,
};
