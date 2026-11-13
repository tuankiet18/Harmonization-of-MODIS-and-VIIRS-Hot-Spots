import { MockDataSource } from './MockDataSource';
import type { DataSource } from './types';

// Swap this single line for a StaticFileDataSource when real data arrives.
export const dataSource: DataSource = new MockDataSource();
