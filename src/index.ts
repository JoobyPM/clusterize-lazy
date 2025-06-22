import ClusterizeLazy, { ClusterizeOptions, PrimaryKey, RowLike } from './core/ClusterizeLazy.ts';

/**
 * Compatibility factory.
 * Lets you call either `new Clusterize(opts)` or just `Clusterize(opts)`.
 */
function Clusterize<TRow = RowLike>(
	opts: ClusterizeOptions<TRow>,
): ClusterizeLazy<TRow> {
	return new ClusterizeLazy(opts);
}

// Keep instanceof checks working
Clusterize.prototype = ClusterizeLazy.prototype;

// Re-export types and class for power users
export type { ClusterizeOptions, PrimaryKey, RowLike };
export { ClusterizeLazy };

// Default export = compatibility factory
export default Clusterize;

// Classic `<script>` users still get `window.Clusterize`
declare const window: Window & { Clusterize?: typeof Clusterize } | undefined;
if (typeof window !== 'undefined') {
	window.Clusterize = Clusterize;
}
