import { Territory, MapData } from '@/types/territory';

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTQrec4NU6nqmsXFlyme-c718xe4eeAQmmaeaP_2TUnJrQQ-UFwr3VXR6LxTJO2GRJt-P238ItWFhdo/pub?output=csv';

export async function fetchGoogleSheetData(): Promise<MapData> {
  try {
    const response = await fetch(SHEET_URL);
    const csvText = await response.text();
    
    return parseCSVToMapData(csvText);
  } catch (error) {
    console.error('Error fetching Google Sheet:', error);
    throw new Error('Failed to fetch map data');
  }
}

function parseCSVToMapData(csvText: string): MapData {
  const lines = csvText.split('\n').filter(line => line.trim());
  
  const territories: Territory[] = [];
  const allianceSet = new Set<string>();
  
  // Parse grid data starting from row 1 (skip header if present)
  for (let rowIndex = 1; rowIndex < lines.length; rowIndex++) {
    const cells = parseCSVLine(lines[rowIndex]);
    
    // Skip empty rows
    if (!cells || cells.length === 0) continue;
    
    // Process each column in this row
    for (let colIndex = 1; colIndex < cells.length; colIndex++) {
      const cellContent = cells[colIndex]?.trim();
      
      // Skip empty cells
      if (!cellContent) continue;
      
      const territoryData = parseTerritoryCell(cellContent);
      if (!territoryData) continue;
      
      // Convert spreadsheet position to map coordinates
      const row = rowIndex; // 1-based row from CSV
      const col = colIndex; // 1-based column from CSV
      const coordinates = `${numberToLetter(row)}${col}`;
      
      const territory: Territory = {
        id: `${row}-${col}`,
        coordinates,
        row,
        col,
        tileType: territoryData.tileType,
        resourceValue: territoryData.resourceValue,
        resourceType: 'Spice', // Default to Spice for imported data
        buildingLevel: Math.floor(territoryData.resourceValue / 50) || 1,
        buildingType: 'Village', // Default building type
        benefits: territoryData.benefits,
        alliance: territoryData.alliance,
        notes: territoryData.notes,
        isOverlay: false,
        isTradePost: false,
        allowsAllianceAssignment: true,
      };
      
      territories.push(territory);
      
      if (territoryData.alliance && territoryData.alliance !== 'OPEN') {
        allianceSet.add(territoryData.alliance);
      }
    }
  }
  
  // Create alliance objects
  const alliances = Array.from(allianceSet).map((name, index) => ({
    id: name.toLowerCase().replace(/\s+/g, '-'),
    name,
    color: getAllianceColor(index),
    territories: territories.filter(t => t.alliance === name),
  }));
  
  // Calculate grid size
  const maxRow = Math.max(...territories.map(t => t.row), 20);
  const maxCol = Math.max(...territories.map(t => t.col), 25);
  
  return {
    territories,
    alliances,
    gridSize: { rows: maxRow, cols: maxCol },
  };
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current);
  return result.map(cell => cell.replace(/^"|"$/g, ''));
}

function parseTerritoryCell(cellContent: string): {
  tileType: 'resource' | 'strategic' | 'neutral';
  resourceValue: number;
  benefits: string[];
  alliance?: string;
  notes?: string;
} | null {
  if (!cellContent || cellContent.trim() === '') return null;
  
  // Pattern: "Lvl X Building Type (coordinates) Alliance/Status"
  // Example: "Lvl 6 Digging Stronghold (412,587) Amex"
  const territoryPattern = /^Lvl\s+(\d+)\s+(.+?)\s+\((\d+),(\d+)\)\s+(.+)$/i;
  const match = cellContent.match(territoryPattern);
  
  if (!match) {
    // Handle simpler formats or just alliance names
    const simplePattern = /^(.+)$/;
    const simpleMatch = cellContent.match(simplePattern);
    if (simpleMatch) {
      const content = simpleMatch[1].trim();
      return {
        tileType: 'neutral',
        resourceValue: 0,
        benefits: [],
        alliance: content === 'OPEN' ? undefined : content,
        notes: cellContent,
      };
    }
    return null;
  }
  
  const level = parseInt(match[1]);
  const buildingType = match[2].trim();
  const gameX = parseInt(match[3]);
  const gameY = parseInt(match[4]);
  const allianceOrStatus = match[5].trim();
  
  // Determine tile type based on building type
  let tileType: 'resource' | 'strategic' | 'neutral' = 'neutral';
  const benefits: string[] = [];
  let resourceValue = level * 10; // Base resource value
  
  if (buildingType.toLowerCase().includes('stronghold')) {
    tileType = 'strategic';
    resourceValue = level * 50;
    benefits.push('Strategic Control', 'High Defense');
  } else if (buildingType.toLowerCase().includes('digging') || 
             buildingType.toLowerCase().includes('mine') ||
             buildingType.toLowerCase().includes('quarry')) {
    tileType = 'resource';
    resourceValue = level * 25;
    benefits.push('Resource Production');
  } else if (buildingType.toLowerCase().includes('trade') ||
             buildingType.toLowerCase().includes('market')) {
    tileType = 'resource';
    resourceValue = level * 20;
    benefits.push('Trade Benefits');
  }
  
  benefits.push(`Level ${level}`, buildingType);
  
  return {
    tileType,
    resourceValue,
    benefits,
    alliance: allianceOrStatus === 'OPEN' ? undefined : allianceOrStatus,
    notes: `${buildingType} (${gameX},${gameY})`,
  };
}

function numberToLetter(num: number): string {
  let result = '';
  while (num > 0) {
    num--; // Make it 0-based
    result = String.fromCharCode(65 + (num % 26)) + result;
    num = Math.floor(num / 26);
  }
  return result;
}

function letterToNumber(letters: string): number {
  let result = 0;
  for (let i = 0; i < letters.length; i++) {
    result = result * 26 + (letters.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
  }
  return result;
}

function getAllianceColor(index: number): string {
  const colors = [
    'hsl(var(--alliance-blue))',
    'hsl(var(--alliance-red))',
    'hsl(var(--alliance-green))',
    'hsl(var(--alliance-orange))',
    'hsl(var(--alliance-purple))',
    'hsl(var(--alliance-yellow))',
  ];
  return colors[index % colors.length];
}