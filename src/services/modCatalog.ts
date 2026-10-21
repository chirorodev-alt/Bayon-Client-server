export type ModCatalogSource = 'modrinth' | 'curseforge';

export type ModCatalogResult = {
  id: string;
  source: ModCatalogSource;
  name: string;
  summary: string;
  author: string;
  iconUrl?: string;
  downloads: number;
  projectUrl: string;
  categories: string[];
};

export type ModSearchOptions = {
  source: ModCatalogSource;
  query: string;
  gameVersion: string;
  loader: string;
};

export async function searchModCatalog(options: ModSearchOptions): Promise<ModCatalogResult[]> {
  if (!window.electronAPI?.searchMods) {
    throw new Error('Mod catalogs are available in the Electron desktop app.');
  }
  return window.electronAPI.searchMods(options);
}
