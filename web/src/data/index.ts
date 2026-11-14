import { ApiDataSource } from './ApiDataSource';
import { MockDataSource } from './MockDataSource';
import type { DataSource } from './types';

// Set at build time: VITE_DATA_SOURCE=api reads the backend (Docker does this); anything else uses the built-in demo data.
const useApi = import.meta.env.VITE_DATA_SOURCE === 'api';

export const dataSource: DataSource = useApi ? new ApiDataSource(import.meta.env.VITE_API_BASE ?? '') : new MockDataSource();
