import fs from 'node:fs/promises';
import { resolve } from 'node:path';

const SOURCE_URL =
  process.env.SOURCE_URL ??
  'https://raw.githubusercontent.com/huangjibbing/KVideo/refs/heads/main/2334.json';
const output = resolve(import.meta.dirname, '..', 'data', 'video-sources.json');
const metaOutput = resolve(import.meta.dirname, '..', 'data', 'video-sources.meta.json');

const response = await fetch(SOURCE_URL, {
  headers: { 'user-agent': 'KVideo-Cloud-Importer/1.0' },
}).catch(async (error) => {
  if (!process.env.SOURCE_FILE) throw error;
  return null;
});
let data;
if (process.env.SOURCE_FILE) {
  data = JSON.parse(await fs.readFile(resolve(process.env.SOURCE_FILE), 'utf8'));
} else {
  if (!response?.ok) {
    throw new Error(`Failed to download source list: ${response?.status} ${response?.statusText}`);
  }
  data = await response.json();
}
if (!Array.isArray(data)) throw new Error('Source list is not an array');

const filtered = data
  .filter((item) => item && typeof item.id === 'string' && typeof item.baseUrl === 'string')
  .filter((item) => item.group !== 'premium')
  .sort((a, b) => (Number(a.priority) || 999) - (Number(b.priority) || 999))
  .map((item) => ({
    id: item.id,
    name: item.name,
    baseUrl: item.baseUrl.replace(/\/+$/, ''),
    group: item.group ?? 'normal',
    enabled: item.enabled !== false,
    priority: Number(item.priority) || 999,
  }));

await fs.mkdir(resolve(import.meta.dirname, '..', 'data'), { recursive: true });
await fs.writeFile(output, `${JSON.stringify(filtered, null, 2)}\n`, 'utf8');
const meta = {
  sourceUrl: SOURCE_URL,
  importedAt: new Date().toISOString(),
  downloaded: data.length,
  imported: filtered.length,
  filteredPremium: data.length - filtered.length,
};
await fs.writeFile(metaOutput, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');

console.log(
  `downloaded=${meta.downloaded} imported=${meta.imported} filtered_premium=${meta.filteredPremium}`,
);
console.log(`written=${output}`);
