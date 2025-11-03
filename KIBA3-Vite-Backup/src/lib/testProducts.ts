/**
 * Test Products for Development and Testing
 * Pre-filled product data for easy testing of steps 1-2
 */

export interface TestProduct {
  id: string;
  name: string;
  category: string;
  quantity: string;
  budget: string;
  projectScope: string;
  vendors: string[];
  description: string;
}

export const TEST_PRODUCTS: TestProduct[] = [
  {
    id: "macbook-pro-16",
    name: "MacBook Pro 16-inch M3 Max",
    category: "Electronics",
    quantity: "5",
    budget: "25000",
    projectScope: "High-performance laptops for software development team. Requirements: 32GB RAM minimum, 1TB SSD, M3 Max chip for AI/ML workloads, excellent battery life, macOS compatibility for iOS development.",
    vendors: ["Apple", "Best Buy", "Amazon", "CDW", "B&H Photo"],
    description: "Latest MacBook Pro with M3 Max chip for professional development work"
  },
  {
    id: "dell-workstation",
    name: "Dell Precision 7780 Workstation",
    category: "Electronics",
    quantity: "3",
    budget: "18000",
    projectScope: "Professional workstations for CAD and 3D modeling. Requirements: Intel Xeon processor, 64GB RAM, NVIDIA RTX graphics, 2TB SSD, Windows 11 Pro, 3-year warranty, dual monitor support.",
    vendors: ["Dell", "CDW", "Insight", "Connection", "SHI"],
    description: "High-end workstation for engineering and design professionals"
  },
  {
    id: "cisco-switch",
    name: "Cisco Catalyst 9300 Switch",
    category: "Networking",
    quantity: "10",
    budget: "15000",
    projectScope: "Enterprise network infrastructure upgrade. Requirements: 48-port Gigabit Ethernet, PoE+ support, Layer 3 switching, StackWise-480, 10G uplinks, Cisco DNA Center compatible, 5-year support.",
    vendors: ["Cisco", "CDW", "SHI", "Insight", "Connection", "WWT"],
    description: "Enterprise-grade network switch for office infrastructure"
  },
  {
    id: "microsoft-surface",
    name: "Microsoft Surface Laptop Studio 2",
    category: "Electronics",
    quantity: "8",
    budget: "20000",
    projectScope: "Creative workstations for design team. Requirements: Intel i7 processor, 32GB RAM, 1TB SSD, NVIDIA RTX graphics, touchscreen with pen support, Windows 11 Pro, portable design for hybrid work.",
    vendors: ["Microsoft", "Best Buy", "Amazon", "CDW", "B&H Photo"],
    description: "2-in-1 laptop for creative professionals and designers"
  },
  {
    id: "hp-printer",
    name: "HP LaserJet Pro 4301fdw",
    category: "Office Equipment",
    quantity: "15",
    budget: "7500",
    projectScope: "Office printing solution for multiple departments. Requirements: Wireless printing, duplex printing, scanning, fax capability, mobile printing support, high-volume printing, network connectivity, 3-year warranty.",
    vendors: ["HP", "CDW", "Staples", "Amazon", "Office Depot"],
    description: "All-in-one wireless printer for office environments"
  }
];

export const getTestProductById = (id: string): TestProduct | undefined => {
  return TEST_PRODUCTS.find(product => product.id === id);
};

export const getTestProductNames = (): Array<{id: string, name: string}> => {
  return TEST_PRODUCTS.map(product => ({
    id: product.id,
    name: product.name
  }));
};
