"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const github = __importStar(require("@actions/github"));
const sys = __importStar(require("systeminformation"));
function getHumanReadableUnitValue(seconds) {
    if (seconds < 1.0e-6) {
        return [seconds * 1e9, 'nsec'];
    }
    else if (seconds < 1.0e-3) {
        return [seconds * 1e6, 'usec'];
    }
    else if (seconds < 1.0) {
        return [seconds * 1e3, 'msec'];
    }
    else {
        return [seconds, 'sec'];
    }
}
function getCommit() {
    /* eslint-disable @typescript-eslint/camelcase */
    if (github.context.payload.head_commit) {
        return github.context.payload.head_commit;
    }
    const pr = github.context.payload.pull_request;
    if (!pr) {
        throw new Error(`No commit information is found in payload: ${JSON.stringify(github.context.payload, null, 2)}`);
    }
    // On pull_request hook, head_commit is not available
    const message = pr.title;
    const id = pr.head.sha;
    const timestamp = pr.head.repo.updated_at;
    const url = `${pr.html_url}/commits/${id}`;
    const name = pr.head.user.login;
    const user = {
        name,
        username: name,
    };
    return {
        author: user,
        committer: user,
        id,
        message,
        timestamp,
        url,
    };
    /* eslint-enable @typescript-eslint/camelcase */
}
function extractPytestResult(output) {
    try {
        const json = JSON.parse(output);
        return json.benchmarks.map(bench => {
            const stats = bench.stats;
            const name = bench.fullname;
            const value = stats.ops;
            const unit = 'iter/sec';
            const range = `stddev: ${stats.stddev}`;
            const [mean, meanUnit] = getHumanReadableUnitValue(stats.mean);
            const extra = `mean: ${mean} ${meanUnit}\nrounds: ${stats.rounds}`;
            return { name, value, unit, range, extra };
        });
    }
    catch (err) {
        throw new Error(`Output file for 'pytest' must be JSON file generated by --benchmark-json option: ${err.message}`);
    }
}
async function extractResult(config) {
    const output = await fs_1.promises.readFile(config.outputFilePath, 'utf8');
    const benches = extractPytestResult(output);
    if (benches.length === 0) {
        throw new Error(`No benchmark result was found in ${config.outputFilePath}. Benchmark output was '${output}'`);
    }
    const commit = getCommit();
    const { speed, cores, physicalCores, processors } = await sys.cpu();
    return {
        cpu: { speed, cores, physicalCores, processors },
        commit,
        date: Date.now(),
        benches,
    };
}
exports.extractResult = extractResult;
//# sourceMappingURL=extract.js.map