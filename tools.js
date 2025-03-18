/**
 * Calculates coop duration for a given coop status, including offline egg contributions.
 * Thank the kind Whale for this function
 *
 * @param {EILib.CoopStatus} coopStatus - Coop status object.
 * @param {number} contractFarmMaximumTimeAllowed - Contract duration in seconds (must be an integer).
 * @param {number} contractMainGoal - The number of eggs required to complete the contract (must be an integer).
 * @return {number} Duration in seconds (integer or float).
 * @throws {Error} If contractFarmMaximumTimeAllowed or contractMainGoal are not integers, or if coopStatus is invalid.
 */
function getCoopDuration(
	coopStatus,
	contractFarmMaximumTimeAllowed,
	contractMainGoal
) {
	// Input validation
	if (
		!Number.isInteger(contractFarmMaximumTimeAllowed) ||
		!Number.isInteger(contractMainGoal)
	) {
		throw new Error(
			"Invalid input: contractFarmMaximumTimeAllowed and contractMainGoal must be integers."
		);
	}

	if (!coopStatus || typeof coopStatus !== "object") {
		throw new Error("Invalid input: coopStatus must be an object.");
	}

	if (
		typeof coopStatus.totalAmount !== "number" ||
		typeof coopStatus.secondsRemaining !== "number"
	) {
		throw new Error(
			"Invalid coopStatus structure: totalAmount and secondsRemaining must be numbers."
		);
	}

	if (coopStatus.allGoalsAchieved) {
		// Coop completed: calculate final duration
		const coopAllowableTimeRemaining = coopStatus.secondsRemaining;

		const duration =
			contractFarmMaximumTimeAllowed -
			coopAllowableTimeRemaining -
			coopStatus.secondsSinceAllGoalsAchieved;
		return Math.max(0, duration); // Return duration in seconds, ensuring no negative values
	} else {
		// Coop is ongoing: calculate how long until the goal is reached

		// Total shipped eggs so far
		const totalShippedEggs = coopStatus.totalAmount;

		// Calculate remaining eggs to be shipped
		let eggsRemaining = Math.max(0, contractMainGoal - totalShippedEggs);

		const contributors =
			coopStatus.contributorsList ?? coopStatus.coopContributors;

		// Sum up the contribution rates and adjust for offline time if available
		const totalContributionRate = contributors.reduce(
			(sum, contributor) => {
				// Use contributionRate if it exists; otherwise, fall back to contributionRatePerSecond
				const rate =
					typeof contributor.contributionRate === "number"
						? contributor.contributionRate
						: contributor.contributionRatePerSecond;

				if (typeof rate !== "number") {
					throw new Error(
						"Invalid contributor data: contributionRate or contributionRatePerSecond must be a number."
					);
				}

				// Check if farmInfo and timestamp exist
				if (
					contributor.farmInfo &&
					typeof contributor.farmInfo.timestamp === "number"
				) {
					// Calculate how long the contributor has been offline (in seconds)
					const offlineDuration = Math.abs(
						contributor.farmInfo.timestamp
					);

					// Calculate offline eggs: contributionRate * offlineDuration
					const offlineEggs =
						contributor.contributionRate * offlineDuration;

					// Subtract offline eggs from eggsRemaining
					eggsRemaining -= offlineEggs;
				} else if (contributor.offlineSeconds) {
					// For EggCoop statuses:
					const offlineDuration = Math.abs(
						contributor.offlineSeconds
					);

					const offlineEggs =
						contributor.contributionRatePerSecond * offlineDuration;

					eggsRemaining -= offlineEggs;
				}

				return sum + contributor.contributionRate;
			},
			0
		);

		// Validate that the total contribution rate is greater than zero
		if (totalContributionRate <= 0) {
			throw new Error(
				"Invalid state: total contribution rate must be greater than zero."
			);
		}

		// Ensure eggsRemaining is not negative
		eggsRemaining = Math.max(0, eggsRemaining);

		// Calculate how long it will take to ship the remaining eggs
		const timeToShipRemainingEggs = eggsRemaining / totalContributionRate;

		// Calculate elapsed time
		const elapsedTime =
			contractFarmMaximumTimeAllowed - coopStatus.secondsRemaining;

		// Return the estimated total duration
		return Math.max(0, elapsedTime + timeToShipRemainingEggs);
	}
}

/**
 * Calculates the buff time value based on a buffHistory and secondsSinceAllGoalsAchieved from coop_status.
 *
 * @param {Array<{ server_time: number, egg_laying_buff: number, earnings_buff: number }>} buffHistory
 *        List of buff objects, each containing a timestamp, egg-laying rate, and earnings multiplier.
 * @param {number} secondsSinceAllGoalsAchieved
 *        The server timestamp indicating when goals were achieved.
 * @returns {number} The computed buff time value.
 * @throws {TypeError} If buffHistory is not an array or secondsSinceAllGoalsAchieved is not a number.
 */
function calculateBuffTimeValue(buffHistory, secondsSinceAllGoalsAchieved) {
	if (!Array.isArray(buffHistory)) {
		throw new TypeError("buffHistory must be an array");
	}
	if (
		typeof secondsSinceAllGoalsAchieved !== "number" ||
		isNaN(secondsSinceAllGoalsAchieved)
	) {
		throw new TypeError(
			"secondsSinceAllGoalsAchieved must be a valid number"
		);
	}
	if (buffHistory.length === 0) return 0;

	buffHistory.sort((a, b) => b.server_time - a.server_time);

	let buffTimeValue = 0;

	for (let i = 0; i < buffHistory.length; i++) {
		const currentBuff = buffHistory[i];

		if (
			typeof currentBuff.server_time !== "number" ||
			typeof currentBuff.egg_laying_buff !== "number" ||
			typeof currentBuff.earnings_buff !== "number"
		) {
			continue;
		}

		const start = currentBuff.server_time;

		if (start <= secondsSinceAllGoalsAchieved) continue;

		let end = secondsSinceAllGoalsAchieved;
		if (i < buffHistory.length - 1) {
			const nextBuffTime = buffHistory[i + 1].server_time;
			end = Math.max(nextBuffTime, secondsSinceAllGoalsAchieved);
		}

		const duration = start - end;
		if (duration <= 0) continue;

		const deflectorPercent = (currentBuff.egg_laying_buff - 1) * 100;
		const siabPercent = (currentBuff.earnings_buff - 1) * 100;

		if (deflectorPercent > 0) {
			buffTimeValue += duration * 7.5 * (deflectorPercent / 100);
		}
		if (siabPercent > 0) {
			buffTimeValue += duration * 0.75 * (siabPercent / 100);
		}
	}
	return buffTimeValue;
}

/**
 * Converts a gradeId to a grade string.
 *
 * @param {number} gradeId - The grade identifier (must be an integer).
 * @param {boolean} [returnFullString=false] - Optional. Whether to return the full grade string. Defaults to false.
 * @param {boolean} [returnLowercase=false] - Optional. Whether to return the grade string in lowercase. Defaults to false.
 * @return {string} The grade corresponding to the gradeId.
 * @throws {Error} If gradeId is not an integer.
 *
 * @example
 * // Returns 'A'
 * convertGrade(3);
 *
 * @example
 * // Returns 'GRADE_A'
 * convertGrade(3, true);
 *
 * @example
 * // Returns 'a'
 * convertGrade(3, false, true);
 *
 * @example
 * // Returns 'grade_a'
 * convertGrade(3, true, true);
 */
function convertGrade(
	gradeId,
	returnFullString = false,
	returnLowercase = false
) {
	// Validate that gradeId is an integer
	if (!Number.isInteger(gradeId)) {
		throw new Error("Invalid input: gradeId must be an integer.");
	}

	// Default values if gradeId is null or undefined
	const gradeNumsShort = {
		0: "UNKNOWN",
		1: "C",
		2: "B",
		3: "A",
		4: "AA",
		5: "AAA",
		6: "ANY",
	};
	const gradeNumsFull = {
		0: "UNKNOWN",
		1: "GRADE_C",
		2: "GRADE_B",
		3: "GRADE_A",
		4: "GRADE_AA",
		5: "GRADE_AAA",
		6: "ANY",
	};

	// Return the appropriate grade string based on returnFullString
	const gradeDict = returnFullString ? gradeNumsFull : gradeNumsShort;
	let gradeString = gradeDict[gradeId] ?? "UNKNOWN"; // Default to 'UNKNOWN' if gradeId not found

	// Convert to lowercase if returnLowercase is true
	if (returnLowercase) {
		gradeString = gradeString.toLowerCase();
	}

	return gradeString;
}

/**
 * Calculates the contribution factor based on the given contribution ratio.
 *
 * @param {number} contributionRatio - The contribution ratio.
 * @return {number} The calculated contribution factor.
 */
function calculateContributionFactor(contributionRatio) {
	if (contributionRatio <= 2.5) {
		return 3 * Math.pow(contributionRatio, 0.15) + 1;
	} else {
		return 0.02221 * Math.min(contributionRatio, 12.5) + 4.386486;
	}
}

/**
 * Creates a CLI progress bar
 * @param {number} percent - Percentage complete (0-100)
 * @param {number} width - Width of the progress bar in characters
 * @returns {string} - Progress bar string
 */
function progressBar(percent, width = 30) {
	const filled = Math.round(width * (percent / 100));
	const empty = width - filled;
	const bar = "█".repeat(filled) + "░".repeat(empty);
	return `[${bar}] ${percent.toFixed(1)}%`;
}

/**
 * Formats time in a human-readable format
 * @param {number} seconds - Time in seconds
 * @returns {string} - Formatted time string
 */
function formatTime(seconds) {
	if (seconds < 60) return `${Math.round(seconds)}s`;
	if (seconds < 3600)
		return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	return `${hours}h ${minutes}m`;
}

module.exports = {
	getCoopDuration,
	calculateBuffTimeValue,
	convertGrade,
	calculateContributionFactor,
	progressBar,
	formatTime,
};
