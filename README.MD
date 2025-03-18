# Egg Inc Contract Analyzer

This tool helps me collect and analyze performance data from Egg Inc contracts and coops. I built it to track player contributions, calculate scoring metrics, and analyze (seasonal) contracts from the game.

## What This Does

I created this to track how players perform in Egg Inc's coops, specifically in those from the Majeggstics. It pulls data from both the EggCoop API and a custom endpoint to get comprehensive information about contracts, coops, and player performance. The main things it does:

- Fetches contract data filtered by game seasons.
- Collects coop data for these contracts, if:
  - The coops are registered to Wonky and available through a special Wonky endpoint. You must add this endpoint as an environment variable.
  - These coops are registered to EggCoop.
  - The contract is between the first occurrences of the starting season (inclusive) and ending season (exclusive).
  - The contract is a seasonal contract if `seasonalOnly` is set to true, false by default.
- Calculates some basic variables per player, like minimal CS (explained below) and coop duration.
- Processes data with rate limiting to avoid API issues.
- Saves progress regularly to prevent data loss.

## Features

- **Season-based filtering**: You can specify which game seasons to analyze.
- **Rate-limited processing**: The tool handles API requests carefully to avoid getting blocked.
- **Performance metrics**: Calculates contribution factors, coop duration, and teamwork scores.
- **Batch processing**: Processes data in configurable batches with progress tracking.

## Setup and Installation

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file with:
   ```
   MAJ_ENDPOINT=https://your.endpoint.com/path?
   ```

## How to Use

Edit the configuration values at the top of `index.js`, if necessary:

```javascript
// Define these two variables to filter the contracts
// The starting season is inclusive, the ending season is exclusive
// If no occurrence of endingSeason is found, every contract after startingSeason is used
const startingSeason = "winter_2025";
const endingSeason = "spring_2025";

// False means all contracts are included, true means only seasonal contracts are included
const seasonalContractsOnly = false;

// Whether or not to clear the coops file before writing new coops
const clearCoopsFile = true;

// Number of coops to process before writing to file
const SAVE_INTERVAL = 50;
```

Then run the script:

```
node index.js
```

The tool will show a progress bar and estimated completion time as it works. It creates three main data files:

- `files/contractList.json` - List of contracts in the selected seasons, with selected other params.
- `files/coopList.json` - The Wonky endpoint response of all contracts combined.
- `files/coops.json` - Detailed data including player contributions and calculated metrics. Saved here are:
  - The latest coop status saved by EggCoop (used in calculations).
  - The contract information from EggCoop.
  - The coop information from the Wonky endpoint.
  - Calculated fields per user from the EggCoop API, like estimated minimal and maximal CS (assuming minimal and maximal TVal and CR).

## Key Metrics

Several performance metrics are calculated for each player:

- **Contribution Factor**: Based on how many eggs they shipped compared to their "fair share".
- **Completion Time Bonus**: Rewards finishing contracts faster.
- **Teamwork Score**: Based on how players use boosts to help the team.
- **Contract Score (CS)**: The `cs` variable is a minimal estimate, since TVal and chicken runs cannot be determined from coop status. The estimate is accurate if TVal and chicken runs are both <= 0.

## Components

- **index.js**: Main script that coordinates the whole process.
- **eggcoop.js**: Functions for interacting with the EggCoop API.
- **maj.js**: Functions for retrieving coop codes and information from the Wonky endpoint.
- **tools.js**: Utility functions for calculations and data processing.

## Rate Limiting

I've built in rate limiting to be respectful to the APIs, mainly EggCoop. Please respect these these services.

You can adjust these settings in `index.js`:

```javascript
const remainingProcessedCoops = await processCoopsWithRateLimiting(
    coops,
    seasonalContracts,
    existingCoops,
    {
        maxParallel: 3, // Process 3 coops in parallel
        requestDelay: 500, // 500ms staggered delay between requests in a batch
        batchDelay: 2000, // 2 second delay between batches
        includeBuffHistory: true, // Enable buff history fetching (makes one more EggCoop API call per player but essential for cs calculations.)
        buffHistoryDelay: 300, // 300ms delay between buff history requests
    }
);
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

Thanks to the EggCoop API for providing the coop information. 

Thanks to Whale for the initial function of calculating coop duration.
