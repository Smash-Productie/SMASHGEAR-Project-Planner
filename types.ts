
export enum GearStatus {
  GOOD = 'Goed',
  USABLE = 'Te gebruiken',
  BROKEN = 'Kapot',
  REPLACING = 'Word vervangen',
  RENTED = 'In Gebruik'
}

export interface GearItem {
  id: string;
  inventoryNumber: string;
  name: string;
  description: string;
  category: string;
  status: GearStatus;
  currentProjectId?: string; // If rented, which project?
  image?: string; // URL to the product image
}

export interface ExternalGear {
  id: string;
  name: string;
  quantity: number;
  vendor?: string;
  pickupDate: string;
  returnDate: string;
  status: 'PENDING' | 'CONFIRMED' | 'PICKED_UP' | 'RETURNED';
}

export interface Project {
  id: string;
  name: string;
  client: string;
  startDate: string;
  endDate: string;
  gearIds: string[]; // Array of GearItem IDs assigned to this project
  externalGear?: ExternalGear[];
  status: 'PREP' | 'ACTIVE' | 'COMPLETED';
}

export type TabView = 'DASHBOARD' | 'INVENTORY' | 'PREP' | 'PROJECTS' | 'SHOOTS';