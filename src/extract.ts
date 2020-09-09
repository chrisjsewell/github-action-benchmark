import { promises as fs } from 'fs';
import * as github from '@actions/github';
import * as sys from 'systeminformation';
import { Config } from './config';

export interface BenchmarkResult {
    name: string;
    value: number;
    range?: string;
    unit: string;
    group?: string | null;
    extra?: string;
}

interface Commit {
    distinct?: unknown; // Unused
    id: string;
    message: string;
    timestamp: string;
    tree_id?: unknown; // Unused
    url: string;
}

interface CpuData {
    speed: string; // in GHz
    cores: number;
    physicalCores: number;
    processors: number;
}

export interface Benchmark {
    commit: Commit;
    date: number;
    benches: BenchmarkResult[];
    cpu?: CpuData;
    extra?: { [key: string]: string };
}

export interface PytestBenchmarkJson {
    machine_info: {
        node: string;
        processor: string;
        machine: string;
        python_compiler: string;
        python_implementation: string;
        python_implementation_version: string;
        python_version: string;
        python_build: string[];
        release: string;
        system: string;
        cpu: {
            vendor_id: string;
            hardware: string;
            brand: string;
        };
    };
    commit_info: {
        id: string;
        time: string;
        author_time: string;
        dirty: boolean;
        project: string;
        branch: string;
    };
    benchmarks: Array<{
        group: null | string;
        name: string;
        fullname: string;
        params: null | string[];
        param: null | string;
        extra_info: object;
        options: {
            disable_gc: boolean;
            time: string;
            min_rounds: number;
            max_time: number;
            min_time: number;
            warmup: boolean;
        };
        stats: {
            min: number;
            max: number;
            mean: number;
            stddev: number;
            rounds: number;
            median: number;
            irq: number;
            q1: number;
            q3: number;
            irq_outliers: number;
            stddev_outliers: number;
            outliers: string;
            ld15iqr: number;
            hd15iqr: number;
            ops: number;
            total: number;
            data: number[];
            iterations: number;
        };
    }>;
    datetime: string;
    version: string;
}

function precise(num: number, sfigs = 5) {
    return Number.parseFloat(`${num}`).toPrecision(sfigs);
}

function getHumanReadableUnitValue(seconds: number): [number, string] {
    if (seconds < 1.0e-6) {
        return [seconds * 1e9, 'nsec'];
    } else if (seconds < 1.0e-3) {
        return [seconds * 1e6, 'usec'];
    } else if (seconds < 1.0) {
        return [seconds * 1e3, 'msec'];
    } else {
        return [seconds, 'sec'];
    }
}

function getCommit(): Commit {
    /* eslint-disable @typescript-eslint/camelcase */
    if (github.context.payload.head_commit) {
        const { id, message, timestamp, url, distinct, tree_id } = github.context.payload.head_commit;
        const output = { id, message, timestamp, url, distinct, tree_id } as Commit;
        if (output.distinct === undefined) {
            delete output.distinct;
        }
        if (output.tree_id === undefined) {
            delete output.tree_id;
        }
        return output;
    }

    const pr = github.context.payload.pull_request;
    if (!pr) {
        throw new Error(
            `No commit information is found in payload: ${JSON.stringify(github.context.payload, null, 2)}`,
        );
    }

    // On pull_request hook, head_commit is not available
    const message: string = pr.title;
    const id: string = pr.head.sha;
    const timestamp: string = pr.head.repo.updated_at;
    const url = `${pr.html_url}/commits/${id}`;

    return {
        id,
        message,
        timestamp,
        url,
    };
    /* eslint-enable @typescript-eslint/camelcase */
}

function extractPytestResult(output: string): { results: BenchmarkResult[]; extra: { [key: string]: string } } {
    try {
        const json: PytestBenchmarkJson = JSON.parse(output);
        return {
            extra: { pythonVersion: json.machine_info.python_version },
            results: json.benchmarks.map(bench => {
                const stats = bench.stats;
                const name = bench.fullname;
                const group = bench.group;
                const value = stats.ops;
                const unit = 'iter/sec';
                const range = `stddev: ${precise(stats.stddev)}`;
                const [mean, meanUnit] = getHumanReadableUnitValue(stats.mean);
                const extra = `mean: ${precise(mean)} ${meanUnit}\nrounds: ${stats.rounds}`;
                return { name, value, unit, range, group, extra };
            }),
        };
    } catch (err) {
        throw new Error(
            `Output file for 'pytest' must be JSON file generated by --benchmark-json option: ${err.message}`,
        );
    }
}

export async function extractResult(config: Config): Promise<Benchmark> {
    const output = await fs.readFile(config.outputFilePath, 'utf8');

    const benches = extractPytestResult(output);
    if (config.metadata !== '') {
        benches.extra['gh-metadata'] = config.metadata;
    }

    if (benches.results.length === 0) {
        throw new Error(`No benchmark result was found in ${config.outputFilePath}. Benchmark output was '${output}'`);
    }

    const commit = getCommit();

    const { speed, cores, physicalCores, processors } = await sys.cpu();

    return {
        cpu: { speed, cores, physicalCores, processors },
        extra: benches.extra,
        commit,
        date: Date.now(),
        benches: benches.results,
    };
}
