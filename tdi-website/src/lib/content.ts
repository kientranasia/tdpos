import {
  Activity,
  Building2,
  CircuitBoard,
  Factory,
  Flame,
  HardHat,
  Landmark,
  LineChart,
  PackageCheck,
  Radar,
  ShieldAlert,
  Ship,
  Workflow
} from 'lucide-react'

export const divisions = [
  {
    title: 'Technology',
    description: 'AI consulting, digital transformation, automation, and SME operating software designed for measurable enterprise throughput.',
    href: '/solutions/industrial-ai-safety',
    icon: CircuitBoard
  },
  {
    title: 'Industrial Infrastructure',
    description: 'Planning and setup of infrastructure systems for industrial parks, factories, and future-ready production environments.',
    href: '/infrastructure',
    icon: Factory
  },
  {
    title: 'Investment & Property',
    description: 'M&A, real estate, and property management initiatives shaped by strategic capital discipline and technology intelligence.',
    href: '/investment',
    icon: Landmark
  },
  {
    title: 'Import / Export',
    description: 'Seafood and agriculture trade operations connecting Vietnam supply strength with regional demand.',
    href: '/import-export',
    icon: Ship
  }
]

export const safetyFeatures = [
  'PPE detection',
  'Helmet detection',
  'Fire and smoke detection',
  'Fall detection',
  'Restricted area monitoring',
  'Unsafe behavior detection',
  'Vehicle and worker proximity alert',
  'Real-time dashboard',
  'Incident reporting',
  'Multi-site monitoring'
]

export const ecosystem = [
  { title: 'AI Safety Monitoring', description: 'Computer vision detects PPE gaps, hazards, smoke, restricted-zone entry, and unsafe behavior.', icon: ShieldAlert },
  { title: 'Workforce Management', description: 'Attendance, workforce allocation, shift visibility, and contractor accountability in one system.', icon: HardHat },
  { title: 'Progress Tracking AI', description: 'Site image intelligence converts field activity into schedule and progress signals.', icon: Activity },
  { title: 'Equipment Monitoring', description: 'Track utilization, idle time, alerts, and operational readiness across heavy equipment.', icon: Radar },
  { title: 'Construction ERP', description: 'Procurement, project controls, finance, inventory, and approval workflows for contractors.', icon: Workflow },
  { title: 'Smart Property Management', description: 'Tenant operations, service requests, maintenance, billing, and asset performance.', icon: Building2 },
  { title: 'Industrial Park OS', description: 'Shared infrastructure, tenant services, utilities, and compliance workflows for park operators.', icon: Factory },
  { title: 'AI Command Center', description: 'A centralized executive cockpit for sites, assets, risk, productivity, and incidents.', icon: LineChart }
]

export const products = [
  {
    title: 'TDPos',
    description: 'Retail and F&B point-of-sale for Vietnamese SMEs with inventory, sales, staff controls, and operational reporting.',
    href: '/products',
    icon: PackageCheck
  },
  {
    title: 'CRM',
    description: 'Pipeline, client relationship, activity, and service workflows for companies scaling revenue operations.',
    href: '/products',
    icon: LineChart
  },
  {
    title: 'ERP',
    description: 'Modular enterprise resource planning for procurement, inventory, finance, approvals, and field execution.',
    href: '/products',
    icon: Workflow
  },
  {
    title: 'AI Monitoring Platform',
    description: 'Industrial AI safety and site intelligence system for high-risk production and construction environments.',
    href: '/solutions/industrial-ai-safety',
    icon: Radar
  }
]

export const industries = [
  'Construction',
  'Manufacturing',
  'Oil & Gas',
  'Industrial Parks',
  'Real Estate',
  'Seafood & Agriculture'
]

export const why = [
  'Enterprise technology delivery with investment-grade operating discipline.',
  'Industrial domain focus across construction, factories, infrastructure, and property.',
  'AI systems designed for safety, productivity, compliance, and executive visibility.',
  'Vietnam and Southeast Asia orientation with practical market execution.'
]

export const solutionCards = [
  { title: 'AI & Digital Transformation', description: 'AI strategy, roadmap execution, automation, and operational intelligence programs.', icon: CircuitBoard },
  { title: 'Industrial AI Safety', description: 'Real-time computer vision monitoring for high-risk industrial environments.', icon: ShieldAlert },
  { title: 'Business Automation', description: 'Digitized approvals, reporting, customer operations, inventory, and back-office workflows.', icon: Workflow },
  { title: 'SME Software', description: 'POS, CRM, ERP, and management tools built for operational reliability.', icon: PackageCheck },
  { title: 'Fire & Smoke Intelligence', description: 'Early warning signals for production areas, storage zones, and construction sites.', icon: Flame },
  { title: 'Executive Dashboards', description: 'Business and site performance reporting for leadership decision cycles.', icon: LineChart }
]
