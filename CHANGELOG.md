# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2025-06-22

### Added
- **Mutation APIs**: `insert()`, `update()`, `remove()`, `_dump()` methods for data manipulation
- **Index management**: `buildIndex` and `primaryKey` options for efficient ID-based operations
- **Type safety**: `PrimaryKey<T>` type for better primary key constraint validation
- **Early validation**: Clear error messages for misuse of buildIndex and invalid insertion indexes
- **Performance optimization**: Automatic index rebuilding for large collections (> 10,000 entries)

### Changed
- **Cleanup improvement**: `destroy()` method now clears the content element's innerHTML

## [1.0.0] - 2025-06-21

### Added
- Initial release with core virtual list functionality
- Lazy loading with skeleton placeholders
- Cache management with TTL and auto-eviction
- TypeScript support
- Framework-agnostic design
