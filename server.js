'use strict';
/*
 * KnitFlow OS — unified manufacturing SaaS for a knitwear company.
 * Zero-dependency Node.js server: REST API + static SPA + JSON persistence.
 * Departments: Merchandising, Purchase, Dye House, Shipping — one roof, one flow.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const STAGES = ['Order Confirmed','Material Sourcing','Ready for Dyeing','Dyeing','Fabric Ready','Production','Packing','Shipped','Delivered'];
const BATCH_NEXT = { Queued: 'Dyeing', Dyeing: 'Drying', Drying: 'QC', Rework: 'Dyeing' };
const SHIP_NEXT = { 'Packing': 'Booked', 'Booked': 'In Transit', 'In Transit': 'Delivered' };

const COMPANY = {
  name: 'Analamanga Knitwear Co.',
  address: 'Lot 42 Industrial Zone, Analamanga, Antananarivo 101, Madagascar',
  phone: '+261 34 12 345 67',
  email: 'trade@analamanga-knit.mg',
  vat: 'MG-VAT-3001199876'
};

const PERMS = {
  merchandising: ['orders', 'buyers', 'samples'],
  purchase: ['reqs', 'pos', 'suppliers', 'materials'],
  dye: ['batches'],
  production: ['production', 'machines'],
  qc: ['inspections'],
  shipping: ['shipments'],
  hr: ['hr'],
  finance: ['finance']
};
const VALID_PERMS = ['orders', 'buyers', 'samples', 'reqs', 'pos', 'suppliers', 'materials', 'batches', 'shipments', 'production', 'machines', 'inspections', 'hr', 'finance'];
const ALL_DEPTS = ['Merchandising', 'Purchase', 'Dye House', 'Shipping', 'Management', 'Production', 'Quality Control', 'Human Resources', 'Finance'];
const WIKI_ALL = () => ({ read: ALL_DEPTS.slice(), edit: ALL_DEPTS.slice() });

let db;
const sessions = new Map(); // token -> userId

/* ---------------------------------------------------------------- data */

function seed() {
  const now = '2026-09-17T09:12:00.000Z';
  const dAgo = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  return {
    seq: { order: 1010, req: 9, po: 2606, batch: 2618, ship: 4506, buyer: 6, supplier: 6, act: 100, sample: 209, prod: 105, qc: 505, emp: 17, ex: 108, user: 10, bnd: 5007, wiki: 116 },
    users: [
      { id: 'U-01', name: 'Amina Rasoanaivo', email: 'admin@knitflow.io', password: 'knit123', role: 'admin', title: 'Managing Director', dept: 'Management' },
      { id: 'U-02', name: 'Hery Andriamampianina', email: 'merch@knitflow.io', password: 'knit123', role: 'merchandising', title: 'Merchandising Manager', dept: 'Merchandising' },
      { id: 'U-03', name: 'Niry Rakotomalala', email: 'purchase@knitflow.io', password: 'knit123', role: 'purchase', title: 'Purchase Head', dept: 'Purchase' },
      { id: 'U-04', name: 'Tiana Rabe', email: 'dye@knitflow.io', password: 'knit123', role: 'dye', title: 'Dye House Supervisor', dept: 'Dye House' },
      { id: 'U-05', name: 'Tojo Velonjara', email: 'shipping@knitflow.io', password: 'knit123', role: 'shipping', title: 'Shipping & Documentation Lead', dept: 'Shipping' },
      { id: 'U-06', name: 'Faniry Ranaivo', email: 'production@knitflow.io', password: 'knit123', role: 'production', title: 'Production Manager', dept: 'Production' },
      { id: 'U-07', name: 'Voahangy Rakoto', email: 'qc@knitflow.io', password: 'knit123', role: 'qc', title: 'QA & Compliance Officer', dept: 'Quality Control' },
      { id: 'U-08', name: 'Mialy Randria', email: 'hr@knitflow.io', password: 'knit123', role: 'hr', title: 'HR Manager', dept: 'Human Resources' },
      { id: 'U-09', name: 'Rivo Ratsimbazafy', email: 'finance@knitflow.io', password: 'knit123', role: 'finance', title: 'Finance Controller', dept: 'Finance' }
    ],
    buyers: [
      { id: 'B-01', name: 'Northwind Retail', country: 'United Kingdom', contact: 'Emily Carter', email: 'emily.carter@northwind.co.uk' },
      { id: 'B-02', name: 'BlueOcean Apparel', country: 'United States', contact: 'Marcus Lee', email: 'sourcing@blueoceanapparel.com' },
      { id: 'B-03', name: 'Alpine Outfitters', country: 'Germany', contact: 'Stefan Braun', email: 's.braun@alpine-outfitters.de' },
      { id: 'B-04', name: 'ModeHaus Copenhagen', country: 'Denmark', contact: 'Freja Lindberg', email: 'freja@modehaus.dk' },
      { id: 'B-05', name: 'UrbanFit Collective', country: 'France', contact: 'Claire Dubois', email: 'c.dubois@urbanfit.fr' }
    ],
    suppliers: [
      { id: 'S-01', name: 'SpinDye Textiles Ltd', type: 'Yarn', location: 'Tirupur, India', rating: 4.6, email: 'sporders@spindye.in' },
      { id: 'S-02', name: 'GreenCotton Mills', type: 'Yarn', location: 'Dhaka, Bangladesh', rating: 4.2, email: 'sales@greencottonmills.bd' },
      { id: 'S-03', name: 'ChemiColor Solutions', type: 'Dyes & Chemicals', location: 'Ludwigshafen, Germany', rating: 4.8, email: 'export@chemicolor.de' },
      { id: 'S-04', name: 'AccuTrim Accessories', type: 'Trims & Accessories', location: 'Guangzhou, China', rating: 4.1, email: 'ken@accutrim.cn' },
      { id: 'S-05', name: 'MerinoSource SA', type: 'Yarn', location: 'Gqeberha, South Africa', rating: 4.5, email: 'trade@merinosource.co.za' }
    ],
    materials: [
      { id: 'M-01', code: 'YRN-COT-30',    name: 'Cotton Yarn 30/1 Combed',      category: 'Yarn',       unit: 'kg',  stock: 12500,  reorder: 5000,   cost: 3.40 },
      { id: 'M-02', code: 'YRN-ACR-24',    name: 'Acrylic Yarn 24/2',            category: 'Yarn',       unit: 'kg',  stock: 9400,   reorder: 4000,   cost: 2.80 },
      { id: 'M-03', code: 'YRN-WOOL-MER',  name: 'Merino Wool 48/2',             category: 'Yarn',       unit: 'kg',  stock: 1850,   reorder: 3000,   cost: 12.50 },
      { id: 'M-04', code: 'YRN-COT-HEA',   name: 'Cotton Heather Yarn 30/1',     category: 'Yarn',       unit: 'kg',  stock: 3200,   reorder: 1500,   cost: 3.55 },
      { id: 'M-05', code: 'DYE-RE-3B',     name: 'Reactive Red 3BS 150%',        category: 'Dye',        unit: 'kg',  stock: 240,    reorder: 100,    cost: 9.80 },
      { id: 'M-06', code: 'DYE-NV-RG',     name: 'Reactive Navy RGB 133%',       category: 'Dye',        unit: 'kg',  stock: 180,    reorder: 80,     cost: 11.20 },
      { id: 'M-07', code: 'DYE-YL-3R',     name: 'Reactive Yellow 3RS',          category: 'Dye',        unit: 'kg',  stock: 210,    reorder: 90,     cost: 9.40 },
      { id: 'M-08', code: 'CHM-SODA',      name: 'Soda Ash Dense',               category: 'Chemical',   unit: 'kg',  stock: 950,    reorder: 400,    cost: 0.60 },
      { id: 'M-09', code: 'CHM-LEV',       name: 'Leveling Agent RD-40',         category: 'Chemical',   unit: 'L',   stock: 410,    reorder: 150,    cost: 2.40 },
      { id: 'M-10', code: 'CHM-SOFT',      name: 'Softener Flakes SIL-88',       category: 'Chemical',   unit: 'kg',  stock: 520,    reorder: 200,    cost: 1.85 },
      { id: 'M-11', code: 'ACC-BTN-15',    name: 'Horn Buttons 15 mm',           category: 'Accessory',  unit: 'pcs', stock: 312000, reorder: 120000, cost: 0.02 },
      { id: 'M-12', code: 'ACC-LBL-MAIN',  name: 'Woven Main & Care Label',      category: 'Accessory',  unit: 'pcs', stock: 84000,  reorder: 100000, cost: 0.03 },
      { id: 'M-13', code: 'ACC-POLY-1215', name: 'Polybag 12x15in + Vulcanite',  category: 'Accessory',  unit: 'pcs', stock: 148000, reorder: 60000,  cost: 0.012 },
      { id: 'M-14', code: 'ACC-CART-40',   name: 'Export Carton 40x32x28 cm',    category: 'Accessory',  unit: 'pcs', stock: 2450,   reorder: 1000,   cost: 0.38 }
    ],
    orders: [
      { id: 'ORD-0990', po: 'UF/5210',    buyerId: 'B-05', style: "Unisex Rib Knit Beanie",           qty: 35000, weightPerPc: 0.09, unitPrice: 2.75,  yarnMaterialId: 'M-02', gauge: '7GG',  incoterm: 'FOB', buttonsPerPc: 0, colors: [{ name: 'Navy', hex: '#1F2A44', share: 50 }, { name: 'Mustard', hex: '#D4A017', share: 30 }, { name: 'Grey', hex: '#9AA0A6', share: 20 }], deliveryDate: '2026-06-20', stage: 'Delivered', createdAt: '2026-05-02T08:00:00.000Z', createdBy: 'U-02' },
      { id: 'ORD-0991', po: 'NW/26/0701', buyerId: 'B-01', style: "Men's V-Neck Sweater 12GG",        qty: 20000, weightPerPc: 0.40, unitPrice: 7.60,  yarnMaterialId: 'M-01', gauge: '12GG', incoterm: 'FOB', buttonsPerPc: 0, colors: [{ name: 'Black', hex: '#111827', share: 60 }, { name: 'Oatmeal', hex: '#D8CFC0', share: 40 }], deliveryDate: '2026-08-30', stage: 'Delivered', createdAt: '2026-06-10T08:00:00.000Z', createdBy: 'U-02' },
      { id: 'ORD-0992', po: 'BO/4298',    buyerId: 'B-02', style: "Women's Crew Neck 7GG",            qty: 15000, weightPerPc: 0.55, unitPrice: 9.90,  yarnMaterialId: 'M-01', gauge: '7GG',  incoterm: 'CIF', buttonsPerPc: 0, colors: [{ name: 'Ivory', hex: '#F3EFE7', share: 55 }, { name: 'Sky', hex: '#7C9CBF', share: 45 }], deliveryDate: '2026-08-15', stage: 'Delivered', createdAt: '2026-05-28T08:00:00.000Z', createdBy: 'U-02' },
      { id: 'ORD-0993', po: 'AL/8710',    buyerId: 'B-03', style: "Kids' Cardigan 14GG",              qty: 26000, weightPerPc: 0.26, unitPrice: 6.10,  yarnMaterialId: 'M-02', gauge: '14GG', incoterm: 'FOB', buttonsPerPc: 4, colors: [{ name: 'Pink', hex: '#E8A0B4', share: 50 }, { name: 'Mint', hex: '#9CC5B0', share: 50 }], deliveryDate: '2026-09-02', stage: 'Delivered', createdAt: '2026-06-22T08:00:00.000Z', createdBy: 'U-02' },
      { id: 'ORD-1001', po: 'NW/26/0912', buyerId: 'B-01', style: "Men's Crew Neck Sweater 12GG",     qty: 24000, weightPerPc: 0.42, unitPrice: 7.80,  yarnMaterialId: 'M-01', gauge: '12GG', incoterm: 'FOB', buttonsPerPc: 0, colors: [{ name: 'Navy', hex: '#1F2A44', share: 45 }, { name: 'Melange Grey', hex: '#9AA0A6', share: 30 }, { name: 'Camel', hex: '#C19A6B', share: 25 }], deliveryDate: '2026-11-15', stage: 'Dyeing', createdAt: '2026-07-18T08:00:00.000Z', createdBy: 'U-02' },
      { id: 'ORD-1002', po: 'BO/4471',    buyerId: 'B-02', style: "Women's Cable Cardigan 7GG",       qty: 18500, weightPerPc: 0.65, unitPrice: 12.40, yarnMaterialId: 'M-03', gauge: '7GG',  incoterm: 'CIF', buttonsPerPc: 6, colors: [{ name: 'Ivory', hex: '#F3EFE7', share: 50 }, { name: 'Dusty Rose', hex: '#C98A97', share: 50 }], deliveryDate: '2026-12-05', stage: 'Material Sourcing', createdAt: '2026-08-25T08:00:00.000Z', createdBy: 'U-02' },
      { id: 'ORD-1003', po: 'AL/8823',    buyerId: 'B-03', style: "Kids' Hooded Pullover 14GG",       qty: 30000, weightPerPc: 0.28, unitPrice: 6.20,  yarnMaterialId: 'M-02', gauge: '14GG', incoterm: 'FOB', buttonsPerPc: 0, colors: [{ name: 'Forest', hex: '#2F5233', share: 40 }, { name: 'Heather Blue', hex: '#7C9CBF', share: 35 }, { name: 'Tango Red', hex: '#B3383D', share: 25 }], deliveryDate: '2026-10-30', stage: 'Production', createdAt: '2026-06-30T08:00:00.000Z', createdBy: 'U-02' },
      { id: 'ORD-1004', po: 'MH/2210',    buyerId: 'B-04', style: "Men's Half-Zip Mock 5GG",          qty: 12800, weightPerPc: 0.72, unitPrice: 15.90, yarnMaterialId: 'M-03', gauge: '5GG',  incoterm: 'CIF', buttonsPerPc: 0, colors: [{ name: 'Charcoal', hex: '#36393E', share: 60 }, { name: 'Sand', hex: '#D6C7A1', share: 40 }], deliveryDate: '2026-11-20', stage: 'Packing', createdAt: '2026-07-05T08:00:00.000Z', createdBy: 'U-02' },
      { id: 'ORD-1005', po: 'NW/26/0877', buyerId: 'B-01', style: "Women's Turtleneck 12GG",          qty: 16000, weightPerPc: 0.38, unitPrice: 8.40,  yarnMaterialId: 'M-01', gauge: '12GG', incoterm: 'FOB', buttonsPerPc: 0, colors: [{ name: 'Black', hex: '#111827', share: 70 }, { name: 'Bordeaux', hex: '#6E1E2A', share: 30 }], deliveryDate: '2026-10-15', stage: 'Shipped', createdAt: '2026-06-25T08:00:00.000Z', createdBy: 'U-02' },
      { id: 'ORD-1006', po: 'UF/5561',    buyerId: 'B-05', style: 'Unisex Rib Beanie — FW Drop 2',    qty: 40000, weightPerPc: 0.09, unitPrice: 2.75,  yarnMaterialId: 'M-02', gauge: '7GG',  incoterm: 'FOB', buttonsPerPc: 0, colors: [{ name: 'Navy', hex: '#1F2A44', share: 50 }, { name: 'Mustard', hex: '#D4A017', share: 30 }, { name: 'Grey', hex: '#9AA0A6', share: 20 }], deliveryDate: '2026-09-28', stage: 'Delivered', createdAt: '2026-07-12T08:00:00.000Z', createdBy: 'U-02' },
      { id: 'ORD-1007', po: 'BO/4502',    buyerId: 'B-02', style: "Men's Quarter-Zip 7GG",            qty: 22000, weightPerPc: 0.55, unitPrice: 11.10, yarnMaterialId: 'M-01', gauge: '7GG',  incoterm: 'CIF', buttonsPerPc: 1, colors: [{ name: 'Slate', hex: '#4B5563', share: 60 }, { name: 'Ecru', hex: '#EFE8D8', share: 40 }], deliveryDate: '2026-12-18', stage: 'Material Sourcing', createdAt: '2026-09-08T08:00:00.000Z', createdBy: 'U-02' },
      { id: 'ORD-1008', po: 'AL/8901',    buyerId: 'B-03', style: "Women's Poncho 5GG",               qty: 6500,  weightPerPc: 0.85, unitPrice: 19.50, yarnMaterialId: 'M-03', gauge: '5GG',  incoterm: 'FOB', buttonsPerPc: 0, colors: [{ name: 'Oatmeal', hex: '#D8CFC0', share: 100 }], deliveryDate: '2026-11-30', stage: 'Fabric Ready', createdAt: '2026-07-22T08:00:00.000Z', createdBy: 'U-02' },
      { id: 'ORD-1009', po: 'MH/2211',    buyerId: 'B-04', style: "Women's Midi Knit Dress 8GG",      qty: 9500,  weightPerPc: 0.60, unitPrice: 17.20, yarnMaterialId: 'M-01', gauge: '8GG',  incoterm: 'CIF', buttonsPerPc: 0, colors: [{ name: 'Bordeaux', hex: '#6E1E2A', share: 60 }, { name: 'Navy', hex: '#1F2A44', share: 40 }], deliveryDate: '2026-12-20', stage: 'Order Confirmed', createdAt: '2026-09-17T09:12:00.000Z', createdBy: 'U-02' }
    ],
    requisitions: [
      { id: 'R-01', orderId: 'ORD-1002', materialId: 'M-03', qty: 13228,  status: 'Pending Approval', note: 'Merino wool incl. 10% wastage', poId: null, createdAt: '2026-09-16T07:30:00.000Z', createdBy: 'U-02' },
      { id: 'R-02', orderId: 'ORD-1002', materialId: 'M-12', qty: 18500,  status: 'Pending Approval', note: 'Main + care labels', poId: null, createdAt: '2026-09-16T07:30:00.000Z', createdBy: 'U-02' },
      { id: 'R-03', orderId: 'ORD-1007', materialId: 'M-01', qty: 13310,  status: 'Approved', note: 'Cotton yarn incl. 10% wastage', poId: null, createdAt: '2026-09-09T09:00:00.000Z', createdBy: 'U-02' },
      { id: 'R-04', orderId: 'ORD-1007', materialId: 'M-12', qty: 22000,  status: 'Approved', note: 'Main + care labels', poId: null, createdAt: '2026-09-09T09:00:00.000Z', createdBy: 'U-02' },
      { id: 'R-05', orderId: 'ORD-1001', materialId: 'M-06', qty: 340,    status: 'Received', note: 'Navy dye (3.4% owf)', poId: 'PO-2602', createdAt: '2026-07-20T09:00:00.000Z', createdBy: 'U-02' },
      { id: 'R-06', orderId: 'ORD-1001', materialId: 'M-01', qty: 11090,  status: 'Received', note: 'Cotton yarn incl. wastage', poId: 'PO-2605', createdAt: '2026-07-18T09:00:00.000Z', createdBy: 'U-02' },
      { id: 'R-07', orderId: 'ORD-1001', materialId: 'M-12', qty: 24000,  status: 'Received', note: 'Main + care labels', poId: null, createdAt: '2026-07-18T09:00:00.000Z', createdBy: 'U-02' },
      { id: 'R-08', orderId: 'ORD-1001', materialId: 'M-13', qty: 24000,  status: 'Received', note: 'Individual polybags', poId: null, createdAt: '2026-07-18T09:00:00.000Z', createdBy: 'U-02' }
    ],
    pos: [
      { id: 'PO-2601', supplierId: 'S-01', orderId: 'ORD-1007', items: [{ materialId: 'M-01', qty: 8000, rate: 3.40 }], status: 'Sent', eta: '2026-09-24', requisitionIds: ['R-03'], createdAt: '2026-09-10T09:00:00.000Z', receivedAt: null },
      { id: 'PO-2602', supplierId: 'S-03', orderId: null,       items: [{ materialId: 'M-06', qty: 150, rate: 11.20 }, { materialId: 'M-08', qty: 500, rate: 0.60 }, { materialId: 'M-10', qty: 300, rate: 1.85 }], status: 'Received', eta: '2026-09-05', requisitionIds: ['R-05'], createdAt: '2026-08-20T09:00:00.000Z', receivedAt: '2026-09-05T10:00:00.000Z' },
      { id: 'PO-2603', supplierId: 'S-05', orderId: 'ORD-1002', items: [{ materialId: 'M-03', qty: 9000, rate: 12.45 }], status: 'Sent', eta: '2026-10-08', requisitionIds: [], createdAt: '2026-09-15T09:00:00.000Z', receivedAt: null },
      { id: 'PO-2604', supplierId: 'S-04', orderId: 'ORD-1002', items: [{ materialId: 'M-12', qty: 120000, rate: 0.03 }], status: 'Sent', eta: '2026-09-26', requisitionIds: [], createdAt: '2026-09-17T08:40:00.000Z', receivedAt: null },
      { id: 'PO-2605', supplierId: 'S-01', orderId: 'ORD-1001', items: [{ materialId: 'M-01', qty: 6000, rate: 3.35 }], status: 'Received', eta: '2026-08-10', requisitionIds: ['R-06'], createdAt: '2026-07-20T09:00:00.000Z', receivedAt: '2026-09-08T15:45:00.000Z' }
    ],
    batches: [
      { id: 'DB-2608', orderId: 'ORD-1003', color: 'Tango Red', hex: '#B3383D', qtyKg: 2100, machine: 'D-02', recipe: 'ACR-RED-03', yarnMaterialId: 'M-02', status: 'Rework',  reworks: 1, startedAt: '2026-09-04T08:00:00.000Z', doneAt: null, note: 'Shade 15% light — sent for re-dye' },
      { id: 'DB-2609', orderId: 'ORD-1003', color: 'Forest', hex: '#2F5233', qtyKg: 3400, machine: 'D-02', recipe: 'ACR-FOREST-07', yarnMaterialId: 'M-02', status: 'Passed', reworks: 0, startedAt: '2026-09-08T08:00:00.000Z', doneAt: '2026-09-10T15:00:00.000Z', note: '', resources: { waterL: 209000, powerKwh: 4100, steamKg: 17200, chemCost: 2900 } },
      { id: 'DB-2610', orderId: 'ORD-1003', color: 'Heather Blue', hex: '#7C9CBF', qtyKg: 2900, machine: 'D-05', recipe: 'ACR-HEATH-02', yarnMaterialId: 'M-02', status: 'Passed', reworks: 0, startedAt: '2026-09-09T08:00:00.000Z', doneAt: '2026-09-12T14:30:00.000Z', note: '' },
      { id: 'DB-2611', orderId: 'ORD-1003', color: 'Tango Red', hex: '#B3383D', qtyKg: 2100, machine: 'D-02', recipe: 'ACR-RED-04', yarnMaterialId: 'M-02', status: 'Passed', reworks: 0, startedAt: '2026-09-11T08:00:00.000Z', doneAt: '2026-09-14T18:22:00.000Z', note: 'Re-dye after shade rejection' },
      { id: 'DB-2612', orderId: 'ORD-1001', color: 'Navy', hex: '#1F2A44', qtyKg: 4600, machine: 'D-04', recipe: 'CTN-NVY-11', yarnMaterialId: 'M-01', status: 'Dyeing', reworks: 0, startedAt: '2026-09-16T16:30:00.000Z', doneAt: null, note: '' },
      { id: 'DB-2613', orderId: 'ORD-1001', color: 'Melange Grey', hex: '#9AA0A6', qtyKg: 3100, machine: 'D-01', recipe: 'CTN-MLG-05', yarnMaterialId: 'M-01', status: 'Drying', reworks: 0, startedAt: '2026-09-15T08:00:00.000Z', doneAt: null, note: '' },
      { id: 'DB-2614', orderId: 'ORD-1001', color: 'Camel', hex: '#C19A6B', qtyKg: 2500, machine: 'D-03', recipe: 'CTN-CML-09', yarnMaterialId: 'M-01', status: 'QC', reworks: 0, startedAt: '2026-09-14T08:00:00.000Z', doneAt: null, note: '' },
      { id: 'DB-2615', orderId: 'ORD-1004', color: 'Charcoal', hex: '#36393E', qtyKg: 5500, machine: 'D-03', recipe: 'MER-CHAR-01', yarnMaterialId: 'M-03', status: 'Passed', reworks: 0, startedAt: '2026-09-05T08:00:00.000Z', doneAt: '2026-09-08T11:00:00.000Z', note: '', resources: { waterL: 338000, powerKwh: 6600, steamKg: 27900, chemCost: 5600 } },
      { id: 'DB-2616', orderId: 'ORD-1004', color: 'Sand', hex: '#D6C7A1', qtyKg: 3700, machine: 'D-05', recipe: 'MER-SAND-02', yarnMaterialId: 'M-03', status: 'Passed', reworks: 0, startedAt: '2026-09-06T08:00:00.000Z', doneAt: '2026-09-09T16:10:00.000Z', note: '' },
      { id: 'DB-2617', orderId: 'ORD-1008', color: 'Oatmeal', hex: '#D8CFC0', qtyKg: 6400, machine: 'D-02', recipe: 'MER-OAT-04', yarnMaterialId: 'M-03', status: 'Passed', reworks: 0, startedAt: '2026-09-12T08:00:00.000Z', doneAt: '2026-09-15T14:02:00.000Z', note: '' }
    ],
    shipments: [
      { id: 'SH-4470', mode: 'Sea', orderId: 'ORD-0990', cartons: 320, cbm: 28, grossKg: 3500, vessel: 'CMA CGM Jules Verne V.220W', booking: 'CMAU6610234', etd: '2026-06-10', eta: '2026-07-08',  portLoading: 'Toamasina (MGTGA)', portDischarge: 'Le Havre (FRLEH)',    status: 'Delivered', createdAt: '2026-06-01T08:00:00.000Z' },
      { id: 'SH-4481', mode: 'Sea', orderId: 'ORD-0992', cartons: 405, cbm: 45, grossKg: 5600, vessel: 'MSC Ambra V.114W',          booking: 'MSCU4410027', etd: '2026-07-12', eta: '2026-08-09',  portLoading: 'Toamasina (MGTGA)', portDischarge: 'New York (USNYC)',    status: 'Delivered', createdAt: '2026-07-02T08:00:00.000Z' },
      { id: 'SH-4488', mode: 'Sea', orderId: 'ORD-0991', cartons: 560, cbm: 62, grossKg: 8900, vessel: 'Maersk Edmonton V.302E',    booking: 'MAEU7712083', etd: '2026-07-28', eta: '2026-08-24',  portLoading: 'Toamasina (MGTGA)', portDischarge: 'Felixstowe (GBFXT)',  status: 'Delivered', createdAt: '2026-07-18T08:00:00.000Z' },
      { id: 'SH-4490', mode: 'Sea', orderId: 'ORD-0993', cartons: 610, cbm: 55, grossKg: 7500, vessel: 'Ever Given V.091S',         booking: 'EGLV9012771', etd: '2026-08-05', eta: '2026-09-01',  portLoading: 'Toamasina (MGTGA)', portDischarge: 'Hamburg (DEHAM)',     status: 'Delivered', createdAt: '2026-07-25T08:00:00.000Z' },
      { id: 'SH-4500', mode: 'Sea', orderId: 'ORD-1006', cartons: 480, cbm: 41, grossKg: 4100, vessel: 'CMA CGM Mars V.088W',       booking: 'CMAU8891020', etd: '2026-08-22', eta: '2026-09-16',  portLoading: 'Toamasina (MGTGA)', portDischarge: 'Le Havre (FRLEH)',    status: 'Delivered', createdAt: '2026-08-10T08:00:00.000Z' },
      { id: 'SH-4501', mode: 'Sea', orderId: 'ORD-1005', cartons: 610, cbm: 68, grossKg: 7900, vessel: 'MSC Ambra V.226W',          booking: 'MSCU2266110', etd: '2026-09-10', eta: '2026-10-08',  portLoading: 'Toamasina (MGTGA)', portDischarge: 'Felixstowe (GBFXT)',  status: 'In Transit', createdAt: '2026-09-01T08:00:00.000Z' },
      { id: 'SH-4502', mode: 'Sea', orderId: 'ORD-1004', cartons: 395, cbm: 52, grossKg: 6300, vessel: 'Maersk Sentosa V.418E',     booking: 'MAEU8811204', etd: '2026-10-02', eta: '2026-10-30',  portLoading: 'Toamasina (MGTGA)', portDischarge: 'Hamburg (DEHAM)',     status: 'Packing', createdAt: '2026-09-17T08:05:00.000Z' },
      { id: 'SH-4504', mode: 'Air', orderId: 'ORD-1002', cartons: 22, cbm: 3.2, grossKg: 360, flightNo: 'ET852 TNR→CDG', airwaybill: '071-88234761', carrier: 'Ethiopian Airlines Cargo', vessel: '', booking: '', etd: '2026-09-16', eta: '2026-09-19', portLoading: 'Antananarivo (TNR)', portDischarge: 'Paris CDG (FRCDG)', status: 'In Transit', createdAt: '2026-09-15T09:00:00.000Z', note: 'Rush 1,200 pcs — buyer launch deadline' },
      { id: 'SH-4505', mode: 'Courier', orderId: 'ORD-1001', cartons: 1, cbm: 0.1, grossKg: 4, carrier: 'DHL', trackingNo: 'JD014600003812345678', flightNo: '', airwaybill: '', vessel: '', booking: '', etd: '2026-09-17', eta: '2026-09-19', portLoading: 'Antananarivo (TNR)', portDischarge: 'London (GBLHR)', status: 'In Transit', createdAt: '2026-09-17T07:40:00.000Z', note: 'TOP samples + shipping docs' }
    ],
    samples: [
      { id: 'SMP-201', orderId: 'ORD-1001', type: 'PP Sample', status: 'Approved', sentDate: '2026-08-10', approvedDate: '2026-08-18', note: 'Navy approved — camel 5% lighter' },
      { id: 'SMP-202', orderId: 'ORD-1002', type: 'Proto Sample', status: 'Approved', sentDate: '2026-09-05', approvedDate: '2026-09-10', note: 'Cable pattern approved' },
      { id: 'SMP-203', orderId: 'ORD-1002', type: 'PP Sample', status: 'Sent', sentDate: '2026-09-15', approvedDate: null, note: 'Dusty rose shade for approval' },
      { id: 'SMP-204', orderId: 'ORD-1003', type: 'TOP Sample', status: 'Approved', sentDate: '2026-09-05', approvedDate: '2026-09-11', note: '' },
      { id: 'SMP-205', orderId: 'ORD-1004', type: 'PP Sample', status: 'Approved', sentDate: '2026-08-25', approvedDate: '2026-08-29', note: '' },
      { id: 'SMP-206', orderId: 'ORD-1007', type: 'Proto Sample', status: 'Requested', sentDate: null, approvedDate: null, note: 'Awaiting knit-down' },
      { id: 'SMP-207', orderId: 'ORD-1008', type: 'Fit Sample', status: 'Comments', sentDate: '2026-08-20', approvedDate: null, note: 'Shoulder too narrow — revising' },
      { id: 'SMP-208', orderId: 'ORD-1009', type: 'Proto Sample', status: 'Requested', sentDate: null, approvedDate: null, note: 'New style — first proto' }
    ],
    machines: [
      { id: 'MC-01', code: 'K-01', type: 'Knitting', model: 'Shima Seiki SES-122FF', gauge: '14GG', status: 'Running', assigned: 'ORD-1003', targetPerDay: 14, events: [ { date: dAgo(0), type: 'run', pcs: 12, hours: 20 }, { date: dAgo(1), type: 'run', pcs: 14, hours: 20 }, { date: dAgo(2), type: 'run', pcs: 13, hours: 20 }, { date: dAgo(3), type: 'down', hours: 4, reason: 'Yarn wait' }, { date: dAgo(3), type: 'run', pcs: 9, hours: 16 }, { date: dAgo(4), type: 'run', pcs: 14, hours: 20 } ] },
      { id: 'MC-02', code: 'K-02', type: 'Knitting', model: 'Shima Seiki SES-122FF', gauge: '14GG', status: 'Running', assigned: 'ORD-1003', targetPerDay: 14, events: [ { date: dAgo(0), type: 'run', pcs: 13, hours: 20 }, { date: dAgo(1), type: 'run', pcs: 14, hours: 20 }, { date: dAgo(2), type: 'run', pcs: 14, hours: 20 }, { date: dAgo(3), type: 'run', pcs: 13, hours: 20 }, { date: dAgo(4), type: 'run', pcs: 14, hours: 20 } ] },
      { id: 'MC-03', code: 'K-03', type: 'Knitting', model: 'Stoll ADF 530-32', gauge: '12GG', status: 'Running', assigned: 'ORD-1001', targetPerDay: 12, events: [ { date: dAgo(0), type: 'run', pcs: 10, hours: 20 }, { date: dAgo(1), type: 'down', hours: 2, reason: 'Program change' }, { date: dAgo(1), type: 'run', pcs: 9, hours: 18 }, { date: dAgo(2), type: 'run', pcs: 12, hours: 20 }, { date: dAgo(3), type: 'run', pcs: 11, hours: 20 }, { date: dAgo(4), type: 'run', pcs: 12, hours: 20 } ] },
      { id: 'MC-04', code: 'K-04', type: 'Knitting', model: 'Stoll ADF 530-32', gauge: '12GG', status: 'Idle', assigned: null, targetPerDay: 12, events: [ { date: dAgo(5), type: 'run', pcs: 11, hours: 20 }, { date: '2026-09-11', type: 'run', pcs: 12, hours: 20 } ] },
      { id: 'MC-05', code: 'K-05', type: 'Knitting', model: 'Universal flat bed', gauge: '7GG', status: 'Running', assigned: 'ORD-1002', targetPerDay: 10, events: [ { date: dAgo(0), type: 'run', pcs: 9, hours: 20 }, { date: dAgo(1), type: 'run', pcs: 10, hours: 20 }, { date: dAgo(2), type: 'down', hours: 6, reason: 'Breakdown — needle bed' }, { date: dAgo(2), type: 'run', pcs: 6, hours: 14 }, { date: dAgo(3), type: 'run', pcs: 10, hours: 20 }, { date: dAgo(4), type: 'run', pcs: 9, hours: 20 } ] },
      { id: 'MC-06', code: 'K-06', type: 'Knitting', model: 'Universal flat bed', gauge: '5GG', status: 'Maintenance', assigned: null, targetPerDay: 10, events: [ { date: dAgo(1), type: 'down', hours: 20, reason: 'Planned maintenance' }, { date: dAgo(0), type: 'down', hours: 20, reason: 'Planned maintenance' } ] },
      { id: 'MC-07', code: 'K-07', type: 'Knitting', model: 'Shima Seiki NSRG-24', gauge: '7GG', status: 'Idle', assigned: null, targetPerDay: 10, events: [ { date: dAgo(4), type: 'run', pcs: 9, hours: 20 } ] },
      { id: 'MC-08', code: 'K-08', type: 'Knitting', model: 'Shima Seiki NSRG-24', gauge: '8GG', status: 'Idle', assigned: null, targetPerDay: 10, events: [] },
      { id: 'MC-09', code: 'D-01', type: 'Dyeing', model: 'Thies Luft-Roto 250 kg', gauge: '—', status: 'Dyeing', assigned: 'DB-2613' },
      { id: 'MC-10', code: 'D-02', type: 'Dyeing', model: 'Fongs FA-10 300 kg', gauge: '—', status: 'Idle', assigned: null },
      { id: 'MC-11', code: 'D-03', type: 'Dyeing', model: 'Thies Luft-Roto 200 kg', gauge: '—', status: 'Running', assigned: 'DB-2614' },
      { id: 'MC-12', code: 'D-04', type: 'Dyeing', model: 'Fongs FA-10 250 kg', gauge: '—', status: 'Dyeing', assigned: 'DB-2612' },
      { id: 'MC-13', code: 'D-05', type: 'Dyeing', model: 'Sclavos Venus 200 kg', gauge: '—', status: 'Idle', assigned: null },
      { id: 'MC-14', code: 'D-06', type: 'Dyeing', model: 'Sclavos Venus 150 kg', gauge: '—', status: 'Idle', assigned: null },
      { id: 'MC-15', code: 'DR-01', type: 'Dryer', model: 'Santex Tandematex 400', gauge: '—', status: 'Running', assigned: 'DB-2613' },
      { id: 'MC-16', code: 'DR-02', type: 'Dryer', model: 'Lafer Hydro 800', gauge: '—', status: 'Idle', assigned: null }
    ],
    bundles: [
      { id: 'BND-5001', barcode: '900001', orderId: 'ORD-1003', qty: 100, scans: [ { floor: 'Knitting', pcs: 100, worker: 'Soa Ravelo', date: dAgo(3) }, { floor: 'Cutting', pcs: 100, worker: 'Paul Rakotonirina', date: dAgo(2) }, { floor: 'Sewing', pcs: 100, worker: 'Jean-Paul Razafi', date: dAgo(1) }, { floor: 'Finishing', pcs: 100, worker: 'Hasina Andrianina', date: dAgo(0) } ] },
      { id: 'BND-5002', barcode: '900002', orderId: 'ORD-1003', qty: 100, scans: [ { floor: 'Knitting', pcs: 100, worker: 'Soa Ravelo', date: dAgo(3) }, { floor: 'Cutting', pcs: 100, worker: 'Paul Rakotonirina', date: dAgo(2) }, { floor: 'Sewing', pcs: 60, worker: 'Jean-Paul Razafi', date: dAgo(0) } ] },
      { id: 'BND-5003', barcode: '900003', orderId: 'ORD-1003', qty: 100, scans: [ { floor: 'Knitting', pcs: 100, worker: 'Soa Ravelo', date: dAgo(2) }, { floor: 'Cutting', pcs: 100, worker: 'Paul Rakotonirina', date: dAgo(1) } ] },
      { id: 'BND-5004', barcode: '900004', orderId: 'ORD-1001', qty: 120, scans: [ { floor: 'Knitting', pcs: 120, worker: 'Soa Ravelo', date: dAgo(1) } ] },
      { id: 'BND-5005', barcode: '900005', orderId: 'ORD-1001', qty: 120, scans: [ { floor: 'Knitting', pcs: 120, worker: 'Soa Ravelo', date: dAgo(0) }, { floor: 'Cutting', pcs: 80, worker: 'Paul Rakotonirina', date: dAgo(0) } ] },
      { id: 'BND-5006', barcode: '900006', orderId: 'ORD-1008', qty: 80, scans: [ { floor: 'Knitting', pcs: 80, worker: 'Soa Ravelo', date: dAgo(1) }, { floor: 'Cutting', pcs: 80, worker: 'Paul Rakotonirina', date: dAgo(0) } ] }
    ],
    production: [
      { id: 'PROD-101', orderId: 'ORD-1003', target: 30000, knit: 30000, cut: 30000, sew: 28400, finish: 26100, machines: ['K-01', 'K-02'], status: 'Open', startedAt: '2026-09-15', logs: [{ date: dAgo(0), floor: 'Finishing', pcs: 1300 }, { date: dAgo(1), floor: 'Sewing', pcs: 2400 }] },
      { id: 'PROD-102', orderId: 'ORD-1004', target: 12800, knit: 12800, cut: 12800, sew: 12800, finish: 12800, machines: ['K-05'], status: 'Done', startedAt: '2026-09-10', logs: [{ date: dAgo(4), floor: 'Finishing', pcs: 4100 }] },
      { id: 'PROD-103', orderId: 'ORD-1001', target: 24000, knit: 12400, cut: 0, sew: 0, finish: 0, machines: ['K-03'], status: 'Open', startedAt: '2026-09-16', logs: [{ date: dAgo(0), floor: 'Knitting', pcs: 2600 }] },
      { id: 'PROD-104', orderId: 'ORD-1008', target: 6500, knit: 6500, cut: 6500, sew: 4100, finish: 0, machines: [], status: 'Open', startedAt: '2026-09-16', logs: [{ date: dAgo(0), floor: 'Sewing', pcs: 900 }] }
    ],
    inspections: [
      { id: 'QC-501', orderId: 'ORD-1004', shipmentId: 'SH-4502', type: 'Final AQL 2.5', sampleSize: 315, crit: 0, major: 2, minor: 5, result: 'Pending', inspector: 'Voahangy Rakoto', date: null, note: 'Booking ETD Oct 2 — needed fast' },
      { id: 'QC-502', orderId: 'ORD-1005', shipmentId: 'SH-4501', type: 'Final AQL 2.5', sampleSize: 200, crit: 0, major: 1, minor: 4, result: 'Pass', inspector: 'Voahangy Rakoto', date: '2026-09-08', note: '' },
      { id: 'QC-503', orderId: 'ORD-1003', shipmentId: null, type: 'Inline Mid-Sewing', sampleSize: 125, crit: 0, major: 0, minor: 3, result: 'Pass', inspector: 'Voahangy Rakoto', date: dAgo(2), note: '' },
      { id: 'QC-504', orderId: 'ORD-1001', shipmentId: null, type: 'Inline Knitting', sampleSize: 80, crit: 0, major: 2, minor: 2, result: 'Fail', inspector: 'Voahangy Rakoto', date: dAgo(1), note: 'Rib tension — retrain line 2' }
    ],
    employees: [
      { id: 'E-01', name: 'Amina Rasoanaivo', dept: 'Management', position: 'Managing Director', joined: '2019-01-15', salary: 2600, status: 'Active' },
      { id: 'E-02', name: 'Hery Andriamampianina', dept: 'Merchandising', position: 'Merchandising Manager', joined: '2020-03-02', salary: 1400, status: 'Active' },
      { id: 'E-03', name: 'Niry Rakotomalala', dept: 'Purchase', position: 'Purchase Head', joined: '2020-06-15', salary: 1300, status: 'Active' },
      { id: 'E-04', name: 'Tiana Rabe', dept: 'Dye House', position: 'Dye House Supervisor', joined: '2021-02-01', salary: 1150, status: 'Active' },
      { id: 'E-05', name: 'Tojo Velonjara', dept: 'Shipping', position: 'Shipping & Documentation Lead', joined: '2020-09-01', salary: 1200, status: 'Active' },
      { id: 'E-06', name: 'Faniry Ranaivo', dept: 'Production', position: 'Production Manager', joined: '2019-11-10', salary: 1500, status: 'Active' },
      { id: 'E-07', name: 'Voahangy Rakoto', dept: 'Quality Control', position: 'QA & Compliance Officer', joined: '2021-05-20', salary: 1050, status: 'Active' },
      { id: 'E-08', name: 'Mialy Randria', dept: 'Human Resources', position: 'HR Manager', joined: '2021-08-01', salary: 1100, status: 'Active' },
      { id: 'E-09', name: 'Rivo Ratsimbazafy', dept: 'Finance', position: 'Finance Controller', joined: '2020-01-20', salary: 1600, status: 'Active' },
      { id: 'E-10', name: 'Soa Ravelo', dept: 'Production', position: 'Knitting Line Lead', joined: '2022-01-10', salary: 520, status: 'Active' },
      { id: 'E-11', name: 'Jean-Paul Razafi', dept: 'Production', position: 'Sewing Supervisor', joined: '2021-03-15', salary: 640, status: 'Active' },
      { id: 'E-12', name: 'Lalao Hutin', dept: 'Dye House', position: 'Dye Machine Operator', joined: '2022-06-01', salary: 460, status: 'Active' },
      { id: 'E-13', name: 'Paul Rakotonirina', dept: 'Production', position: 'Cutting Master', joined: '2020-07-15', salary: 580, status: 'Active' },
      { id: 'E-14', name: 'Hasina Andrianina', dept: 'Shipping', position: 'Packing Supervisor', joined: '2023-02-01', salary: 480, status: 'Active' },
      { id: 'E-15', name: 'Fara Delphine', dept: 'Merchandising', position: 'Junior Merchandiser', joined: '2024-04-01', salary: 520, status: 'Active' },
      { id: 'E-16', name: 'Sitraka Nomena', dept: 'Finance', position: 'Accountant', joined: '2023-09-01', salary: 700, status: 'Active' }
    ],
    attendance: {
      [dAgo(0)]: { 'E-01': 'P', 'E-02': 'P', 'E-03': 'P', 'E-04': 'P', 'E-05': 'P', 'E-06': 'P', 'E-07': 'P', 'E-08': 'P', 'E-09': 'P', 'E-10': 'P', 'E-11': 'P', 'E-12': 'A', 'E-13': 'P', 'E-14': 'P', 'E-15': 'L', 'E-16': 'P' }
    },
    invoices: [
      { id: 'INV-4481', shipmentId: 'SH-4481', orderId: 'ORD-0992', buyerId: 'B-02', amount: 148500, status: 'Paid', issued: '2026-07-12', due: '2026-08-11', payments: [{ date: '2026-08-08', amount: 148500, ref: 'TT-BANK-8812' }] },
      { id: 'INV-4488', shipmentId: 'SH-4488', orderId: 'ORD-0991', buyerId: 'B-01', amount: 152000, status: 'Paid', issued: '2026-07-28', due: '2026-08-27', payments: [{ date: '2026-08-24', amount: 152000, ref: 'LC-BANK-1043' }] },
      { id: 'INV-4490', shipmentId: 'SH-4490', orderId: 'ORD-0993', buyerId: 'B-03', amount: 158600, status: 'Paid', issued: '2026-08-05', due: '2026-09-04', payments: [{ date: '2026-09-01', amount: 158600, ref: 'TT-BANK-9032' }] },
      { id: 'INV-4500', shipmentId: 'SH-4500', orderId: 'ORD-1006', buyerId: 'B-05', amount: 110000, status: 'Open', issued: '2026-08-22', due: '2026-10-06', payments: [] },
      { id: 'INV-4501', shipmentId: 'SH-4501', orderId: 'ORD-1005', buyerId: 'B-01', amount: 134400, status: 'Partial', issued: '2026-09-10', due: '2026-10-25', payments: [{ date: dAgo(2), amount: 40000, ref: 'TT advance 30%' }] }
    ],
    expenses: [
      { id: 'EX-101', date: '2026-09-01', category: 'Salaries', desc: 'August payroll', amount: 15400 },
      { id: 'EX-102', date: '2026-09-03', category: 'Dyes & Chemicals', desc: 'ChemiColor local purchase', amount: 4200 },
      { id: 'EX-103', date: '2026-09-05', category: 'Freight & Handling', desc: 'CFS & inland haulage', amount: 2800 },
      { id: 'EX-104', date: '2026-09-08', category: 'Utilities', desc: 'Electricity + water — August', amount: 5100 },
      { id: 'EX-105', date: '2026-09-10', category: 'Maintenance', desc: 'D-02 spare parts & service', amount: 950 },
      { id: 'EX-106', date: dAgo(5), category: 'Salaries', desc: 'Casual labor — packing', amount: 1200 },
      { id: 'EX-107', date: dAgo(2), category: 'Other', desc: 'Office & communications', amount: 340 }
    ],
    costsheets: [
      { id: 'CS-1001', orderId: 'ORD-1001', yarnKg: 11090, yarnRate: 3.35, dyeChemPerKg: 0.85, trimsPerPc: 0.09, cmPerPc: 1.65, overheadPct: 8, freightPerPc: 0, note: '' },
      { id: 'CS-1002', orderId: 'ORD-1002', yarnKg: 13228, yarnRate: 12.45, dyeChemPerKg: 1.1, trimsPerPc: 0.24, cmPerPc: 2.9, overheadPct: 8, freightPerPc: 0.35, note: 'CIF — freight included' },
      { id: 'CS-1003', orderId: 'ORD-1003', yarnKg: 8570, yarnRate: 2.8, dyeChemPerKg: 0.8, trimsPerPc: 0.11, cmPerPc: 1.45, overheadPct: 8, freightPerPc: 0, note: 'incl. 4 buttons/pc' },
      { id: 'CS-1004', orderId: 'ORD-1004', yarnKg: 9220, yarnRate: 12.5, dyeChemPerKg: 1.05, trimsPerPc: 0.2, cmPerPc: 3.4, overheadPct: 8, freightPerPc: 0.4, note: '' }
    ],
    wiki: [
  {
    "id": "WIKI-101",
    "type": "SOP",
    "title": "Shipment document preparation & bank submission",
    "dept": "Shipping",
    "owner": "Tojo Velonjara",
    "status": "Published",
    "version": 4,
    "updated": dAgo(2),
    "tags": [
      "export",
      "documents",
      "banking",
      "SOP"
    ],
    "linkOrder": null,
    "sections": [
      {
        "h": "Purpose",
        "body": "Every shipment leaves with a complete, consistent document set so the buyer clears customs without a single query."
      },
      {
        "h": "Scope",
        "body": "All export shipments from Toamasina — sea, air and courier."
      },
      {
        "h": "Steps",
        "body": "1. Check the L/C or purchase order against the final invoice value.\n2. Weigh the loaded truck at the weighbridge — packing-list weights must match within 2%.\n3. Print the packing list and commercial invoice from the shipment card (Documents buttons).\n4. Attach the transport document for the mode:\n   • Sea — Bill of lading from the forwarder (booking no. must match).\n   • Air — AWB issued by the carrier (flight no. must match).\n   • Courier — courier waybill (tracking no. must match).\n5. Collect the Certificate of Origin from the Chamber of Commerce (allow 1 working day).\n6. Submit the full set to the bank / buyer within 3 working days of gate-out."
      },
      {
        "h": "Common errors",
        "body": "Invoice value differs from L/C • carton count on packing list differs from survey report • missing HS code 6110 on courier proforma • AWB copy not endorsed."
      },
      {
        "h": "KPI",
        "body": "Documents submitted ≤ 3 working days after gate-out. Track misses in the monthly shipping report."
      }
    ]
  },
  {
    "id": "WIKI-102",
    "type": "SOP",
    "title": "Dye lot approval, RFT & rework",
    "dept": "Dye House",
    "owner": "Tiana Rabe",
    "status": "Published",
    "version": 5,
    "updated": dAgo(1),
    "tags": [
      "dyeing",
      "RFT",
      "quality",
      "SOP"
    ],
    "linkOrder": null,
    "sections": [
      {
        "h": "Purpose",
        "body": "Right-first-time dyeing. Every bulk lot must match the approved lab dip before fabric moves to cutting."
      },
      {
        "h": "Approval path",
        "body": "Lab dip (3 options) → buyer or merchandiser approval → bulk lot → QC check → fabric release."
      },
      {
        "h": "Acceptance limits",
        "body": "• ΔE ≤ 1.0 vs approved lab dip under D65 light.\n• RFT (right-first-time) target ≥ 90% per month.\n• Water ≤ 60 L per kg, power ≤ 1.2 kWh per kg, steam ≤ 5 kg per kg — record actuals in the Dye House module."
      },
      {
        "h": "Rework rule",
        "body": "One re-dye allowed after a failed QC. A second failure escalates to Merchandising + buyer for a shade band review — never re-dye twice without approval."
      },
      {
        "h": "Records",
        "body": "Batch DB-#### entries must carry the recipe, resources and QC result the same day. Dye KPIs are read from those records."
      }
    ]
  },
  {
    "id": "WIKI-103",
    "type": "SOP",
    "title": "Knitting inline quality checks (4-point)",
    "dept": "Production",
    "owner": "Faniry Ranaivo",
    "status": "Published",
    "version": 2,
    "updated": dAgo(4),
    "tags": [
      "knitting",
      "QC",
      "4-point",
      "SOP"
    ],
    "linkOrder": null,
    "sections": [
      {
        "h": "Purpose",
        "body": "Catch panel defects at the machine, not at final inspection."
      },
      {
        "h": "Hourly checks",
        "body": "• Tambour / fabric surface visual check.\n• Measurement check on a fresh panel every 2 hours against the tech sheet (see Wiki tech sheets).\n• Needle-ladder and oil-stain scan under the inspection lamp."
      },
      {
        "h": "4-point system",
        "body": "Score defects: 1 pt (< 3 cm), 2 pts (3–6 cm), 4 pts (> 9 cm). Hold the panel when it exceeds 28 points per 100 m²."
      },
      {
        "h": "Stop authority",
        "body": "Any knitter may stop a machine for a repeating defect. Log the downtime event on the Machine Board immediately — unlogged stoppages count against utilization."
      }
    ]
  },
  {
    "id": "WIKI-104",
    "type": "SOP",
    "title": "Flat-knitter start-up & daily cleaning",
    "dept": "Production",
    "owner": "Faniry Ranaivo",
    "status": "Published",
    "version": 3,
    "updated": dAgo(6),
    "tags": [
      "machines",
      "Puyuan",
      "maintenance",
      "SOP"
    ],
    "linkOrder": null,
    "sections": [
      {
        "h": "Scope",
        "body": "All flat knitters (Shenzhou + Puyuan banks), start of every shift."
      },
      {
        "h": "Start-up sequence",
        "body": "1. Blow the needle bed with compressed air — lint first, then visual.\n2. Check oil level in the carriage and top up to the sight-glass mark.\n3. Run a 20-course test swatch; verify stitch length against the tech sheet.\n4. Load the pattern file and confirm the pattern hash matches the tech pack version.\n5. Set the machine target on the Machine Board (see machine card)."
      },
      {
        "h": "Shutdown",
        "body": "Empty the needle bed, drop the take-down, wipe the carriage rail, leave the machine in 'Idle' on the board."
      },
      {
        "h": "Weekly",
        "body": "Deep-clean the yarn feeders every Monday before the shift; record as 'Maintenance' so utilization stays honest."
      }
    ]
  },
  {
    "id": "WIKI-105",
    "type": "SOP",
    "title": "Bundle scan discipline on the sewing floor",
    "dept": "Production",
    "owner": "Faniry Ranaivo",
    "status": "Published",
    "version": 2,
    "updated": dAgo(3),
    "tags": [
      "barcode",
      "sewing",
      "WIP",
      "SOP"
    ],
    "linkOrder": null,
    "sections": [
      {
        "h": "Purpose",
        "body": "The scan module is the factory's truth. If a piece is not scanned, it does not exist."
      },
      {
        "h": "Rules",
        "body": "• Scan every bundle at every operation — never skip a station.\n• Never split a bundle; the barcode stands for the full bundle quantity.\n• Over-scan is blocked at 100% of bundle quantity (error 400 by design).\n• End of day: reconcile scanned vs issued bundles; investigate every gap before the next shift."
      },
      {
        "h": "Reporting",
        "body": "Worker efficiency and floor WIP are computed from scans only. Manual counts are not accepted as corrections — fix the scan, not the report."
      }
    ]
  },
  {
    "id": "WIKI-106",
    "type": "SOP",
    "title": "Sample submission workflow (proto → TOP)",
    "dept": "Merchandising",
    "owner": "Hery Andriamampianina",
    "status": "Published",
    "version": 3,
    "updated": dAgo(5),
    "tags": [
      "sampling",
      "approvals",
      "Dalang",
      "SOP"
    ],
    "linkOrder": null,
    "sections": [
      {
        "h": "Purpose",
        "body": "Buyer approvals earned on time, in the right order, with no wasted couriers."
      },
      {
        "h": "Stages",
        "body": "Proto (7 days) → Fit (5 days) → PP sample — must be approved BEFORE bulk cutting → TOP sample travels with the shipment."
      },
      {
        "h": "Internal SLA",
        "body": "Sampling room photos + measurement sheet within 48 h of sample completion; merchandiser review same day."
      },
      {
        "h": "Courier",
        "body": "Book sample couriers through Shipping (packing instruction WIKI-114). Never put samples in personal luggage."
      },
      {
        "h": "Records",
        "body": "Log every submission and approval in the Sampling module — the buyer-facing status must always be current."
      }
    ]
  },
  {
    "id": "WIKI-107",
    "type": "SOP",
    "title": "Yarn incoming inspection & shade band retention",
    "dept": "Purchase",
    "owner": "Niry Rakotomalala",
    "status": "Published",
    "version": 2,
    "updated": dAgo(8),
    "tags": [
      "yarn",
      "warehouse",
      "inspection",
      "SOP"
    ],
    "linkOrder": null,
    "sections": [
      {
        "h": "Scope",
        "body": "Every yarn lot entering the store, before it is booked into inventory."
      },
      {
        "h": "Checks",
        "body": "• Sample 10% of cones per lot — count, lot number and cone condition.\n• Twist and count verification on the wrap wheel vs the PO spec.\n• Store humidity 60% ±5%; keep lot bands on the shade rack."
      },
      {
        "h": "Retention",
        "body": "Keep shade bands and lot labels for 2 years — they are the evidence in any buyer shade claim."
      },
      {
        "h": "Mismatch",
        "body": "Any mismatch → hold the requisition, photograph the cones, raise the supplier claim within 7 days. Never issue suspect yarn to knitting."
      }
    ]
  },
  {
    "id": "WIKI-108",
    "type": "TECH",
    "title": "Tech sheet — Women's Cable Cardigan 7GG (BO/4471)",
    "dept": "Merchandising",
    "owner": "Hery Andriamampianina",
    "status": "Published",
    "version": 6,
    "updated": dAgo(1),
    "tags": [
      "BO/4471",
      "cardigan",
      "7GG",
      "BlueOcean"
    ],
    "linkOrder": "ORD-1002",
    "sections": [
      {
        "h": "Construction",
        "body": "Cable 4×4 front panels · plain back · 1×1 rib bottom, cuffs and collar. Link closing at collar — no raw edges."
      },
      {
        "h": "Finishing",
        "body": "Wash 40 °C 15 min · tumble low · steam press on the profile board. Buttonholes sewn after wash."
      },
      {
        "h": "Trims",
        "body": "5 × horn button 18 mm · main label + care label + size sticker in every polybag."
      },
      {
        "h": "Packing",
        "body": "Solid pack per WIKI-112 (20 pcs per carton, sea). Rush top-ups go by air per WIKI-113."
      },
      {
        "h": "Reference",
        "body": "Order ORD-1002 · buyer BlueOcean Apparel · 18,500 pcs · seasonal Navy / Camel / Ivory."
      }
    ],
    "specs": [
      [
        "Gauge",
        "7 GG flat (Shima / Puyuan)"
      ],
      [
        "Yarn",
        "30% wool · 50% acrylic · 20% nylon — Nm 2/26, 2 ends"
      ],
      [
        "Unit weight",
        "480 g"
      ],
      [
        "Sizes",
        "S–XL · ratio 1:2:2:1"
      ],
      [
        "Colorways",
        "Navy / Camel / Ivory"
      ],
      [
        "Care label",
        "EN / FR — 30 °C mild wash, dry flat"
      ],
      [
        "HS code",
        "611011"
      ]
    ],
    "poms": [
      [
        "POM",
        "S",
        "M",
        "L",
        "XL",
        "Tol."
      ],
      [
        "Chest width (cm)",
        "48",
        "52",
        "56",
        "60",
        "±1.0"
      ],
      [
        "Body length (cm)",
        "60",
        "62",
        "64",
        "66",
        "±1.5"
      ],
      [
        "Sleeve length (cm)",
        "57",
        "58",
        "59",
        "60",
        "±1.0"
      ],
      [
        "Shoulder (cm)",
        "38",
        "40",
        "42",
        "44",
        "±1.0"
      ],
      [
        "Neck drop (cm)",
        "8.0",
        "8.5",
        "9.0",
        "9.5",
        "±0.5"
      ]
    ]
  },
  {
    "id": "WIKI-109",
    "type": "TECH",
    "title": "Tech sheet — Men's Crew Neck 5GG (NW/26/0912)",
    "dept": "Merchandising",
    "owner": "Hery Andriamampianina",
    "status": "Published",
    "version": 4,
    "updated": dAgo(9),
    "tags": [
      "NW/26/0912",
      "crew",
      "5GG",
      "jacquard"
    ],
    "linkOrder": "ORD-1001",
    "sections": [
      {
        "h": "Construction",
        "body": "Plain body with intarsia chest stripe · 1×1 rib neck, cuffs and hem · tubular finish on body."
      },
      {
        "h": "Finishing",
        "body": "Wash 40 °C · tumble low · light steam. Stripe alignment checked after wash on size M."
      },
      {
        "h": "Trims",
        "body": "Main + care label · no external logos unless the buyer portal label pack says otherwise."
      },
      {
        "h": "Packing",
        "body": "Solid pack per WIKI-112 — 620 g unit weight, 18 pcs per carton to respect the 22 kg gross limit."
      }
    ],
    "specs": [
      [
        "Gauge",
        "5 GG flat"
      ],
      [
        "Yarn",
        "100% combed cotton — Nm 2/30, 3 ends"
      ],
      [
        "Unit weight",
        "620 g"
      ],
      [
        "Sizes",
        "M–XXL · ratio 1:2:2:1"
      ],
      [
        "Colorways",
        "Ecru / Forest / Charcoal"
      ],
      [
        "Care label",
        "EN / FR — 30 °C wash"
      ],
      [
        "HS code",
        "611020"
      ]
    ],
    "poms": [
      [
        "POM",
        "M",
        "L",
        "XL",
        "XXL",
        "Tol."
      ],
      [
        "Chest width (cm)",
        "50",
        "54",
        "58",
        "62",
        "±1.0"
      ],
      [
        "Body length (cm)",
        "64",
        "66",
        "68",
        "70",
        "±1.5"
      ],
      [
        "Sleeve length (cm)",
        "59",
        "60",
        "61",
        "62",
        "±1.0"
      ],
      [
        "Shoulder (cm)",
        "42",
        "44",
        "46",
        "48",
        "±1.0"
      ],
      [
        "Rib neck height (cm)",
        "6",
        "6",
        "6",
        "6",
        "±0.5"
      ]
    ]
  },
  {
    "id": "WIKI-110",
    "type": "TECH",
    "title": "Tech sheet — Baby Cardigan 12GG (KL/26/077)",
    "dept": "Merchandising",
    "owner": "Hery Andriamampianina",
    "status": "Published",
    "version": 2,
    "updated": dAgo(7),
    "tags": [
      "KL/26/077",
      "baby",
      "12GG",
      "compliance"
    ],
    "linkOrder": "ORD-1003",
    "sections": [
      {
        "h": "Compliance",
        "body": "EN 71-3 — no loose parts, nickel-free snaps, safety stitching on all trims. Compliance sign-off required before bulk."
      },
      {
        "h": "Construction",
        "body": "Fine-gauge pointelle yoke · button-through · 1×1 rib cuffs. Snap press after wash."
      },
      {
        "h": "Finishing",
        "body": "Extra-soft wash 30 °C · no tumble · steam lightly. Verify softness hand-feel against the approved keeper sample."
      },
      {
        "h": "Packing",
        "body": "Polybag with ventilation holes per baby-wear rule; solid pack per WIKI-112, 30 pcs per carton (light weight)."
      }
    ],
    "specs": [
      [
        "Gauge",
        "12 GG flat"
      ],
      [
        "Yarn",
        "60% cotton · 40% premium acrylic — Nm 2/48, 1 end"
      ],
      [
        "Unit weight",
        "180 g"
      ],
      [
        "Sizes",
        "6M / 12M / 18M / 24M · ratio 1:1:1:1"
      ],
      [
        "Colorways",
        "Pastel Blue / Blush / Mint"
      ],
      [
        "Care label",
        "EN / FR — 30 °C, do not tumble"
      ],
      [
        "HS code",
        "611120"
      ]
    ],
    "poms": [
      [
        "POM",
        "6M",
        "12M",
        "18M",
        "24M",
        "Tol."
      ],
      [
        "Chest width (cm)",
        "24",
        "26",
        "28",
        "30",
        "±0.8"
      ],
      [
        "Body length (cm)",
        "28",
        "31",
        "34",
        "37",
        "±1.0"
      ],
      [
        "Sleeve length (cm)",
        "18",
        "21",
        "24",
        "27",
        "±0.8"
      ]
    ]
  },
  {
    "id": "WIKI-111",
    "type": "TECH",
    "title": "Tech sheet — Rib Beanie 3GG (BO/4472)",
    "dept": "Merchandising",
    "owner": "Hery Andriamampianina",
    "status": "Published",
    "version": 1,
    "updated": dAgo(12),
    "tags": [
      "BO/4472",
      "beanie",
      "3GG",
      "accessory"
    ],
    "linkOrder": "ORD-1004",
    "sections": [
      {
        "h": "Construction",
        "body": "2×2 rib, fold-over brim 12 cm · fully-fashioned crown with linked closing."
      },
      {
        "h": "Finishing",
        "body": "Wash 30 °C · dry flat · light steam on brim only."
      },
      {
        "h": "Trims",
        "body": "Woven flag label on brim · no hangtag (buyer decision Oct 2025)."
      },
      {
        "h": "Packing",
        "body": "Polybagged individually, 40 pcs per carton per WIKI-112; mixed colorways allowed in one carton — one size only."
      }
    ],
    "specs": [
      [
        "Gauge",
        "3 GG flat"
      ],
      [
        "Yarn",
        "100% lambswool — Nm 2/16, 2 ends"
      ],
      [
        "Unit weight",
        "140 g"
      ],
      [
        "Sizes",
        "One size"
      ],
      [
        "Colorways",
        "Rust / Oatmeal / Black"
      ],
      [
        "Care label",
        "EN / FR — hand wash cold"
      ],
      [
        "HS code",
        "611710"
      ]
    ]
  },
  {
    "id": "WIKI-112",
    "type": "PACK",
    "title": "Packing instruction — solid export carton (sea)",
    "dept": "Shipping",
    "owner": "Tojo Velonjara",
    "status": "Published",
    "version": 5,
    "updated": dAgo(3),
    "tags": [
      "carton",
      "sea",
      "marks",
      "packing"
    ],
    "linkOrder": null,
    "sections": [
      {
        "h": "Fold method",
        "body": "Fold to 30 × 40 cm, back panel out, in a 40 × 50 polybag with size sticker on the front-left corner."
      },
      {
        "h": "Marking layout",
        "body": "Main mark on both carton ends:\n   ANALAMANGA KNITWEAR / buyer PO no. / style no.\n   Side mark: carton no. n of N · sizes · color · quantity · gross/net kg · port of discharge.\n   STC printed under the side mark on every carton."
      },
      {
        "h": "Before closing",
        "body": "Photograph the loaded pallet rows and the closed carton face — attach to the shipment record in case of a survey query."
      },
      {
        "h": "Tie-in to documents",
        "body": "Carton list on the packing list must match the physical count exactly; weighbridge ticket within 2% of packing-list gross."
      }
    ],
    "carton": [
      [
        "Carton",
        "60 × 40 × 50 cm — 5-ply kraft, double wall"
      ],
      [
        "Contents",
        "20 pcs per carton · 1 pc per polybag"
      ],
      [
        "Net / gross",
        "9.6 kg / 11.2 kg — max 22 kg gross"
      ],
      [
        "Container",
        "400 ctns ≈ 48 CBM in 1 × 40HC"
      ],
      [
        "Sealing",
        "H-taping 48 mm PP + 2 × PET strapping"
      ],
      [
        "Cushioning",
        "Silica gel 2 × 10 g per carton"
      ]
    ]
  },
  {
    "id": "WIKI-113",
    "type": "PACK",
    "title": "Packing instruction — air freight rush (AWB shipments)",
    "dept": "Shipping",
    "owner": "Tojo Velonjara",
    "status": "Published",
    "version": 3,
    "updated": dAgo(2),
    "tags": [
      "air",
      "AWB",
      "rush",
      "packing"
    ],
    "linkOrder": null,
    "sections": [
      {
        "h": "When to use",
        "body": "Buyer launch deadlines, missed vessel cut-offs, or TOP samples with a hard review date. Freight cost is ~6–8× sea — merchandiser approval is mandatory before booking."
      },
      {
        "h": "Carton rule",
        "body": "5-ply light carton, max 15 kg gross, 10 pcs of cardigans per carton typical. Chargeable weight = max(actual, volume × 167 kg/m³) — report dims to the forwarder."
      },
      {
        "h": "Labels",
        "body": "'AIR CARGO' labels on two sides + AWB pouch on piece 1 of the AWB. No strapping — airports reject strapped cartons at screening."
      },
      {
        "h": "Documents",
        "body": "Commercial invoice 3 copies + packing list inside the pouch; AWB number must match the shipment card exactly."
      },
      {
        "h": "Worked example",
        "body": "SH-4504 — 22 cartons / 360 kg on ET852 TNR→CDG, AWB 071-88234761: rush 1,200 pcs of WIKI-108 for BlueOcean's Paris launch."
      }
    ],
    "carton": [
      [
        "Carton",
        "55 × 38 × 38 cm — 5-ply light"
      ],
      [
        "Contents",
        "10 pcs per carton (7GG cardigans)"
      ],
      [
        "Net / gross",
        "4.8 kg / 6.1 kg — max 15 kg gross"
      ],
      [
        "Chargeable weight",
        "max(actual kg, CBM × 167)"
      ],
      [
        "Sealing",
        "Taping only — no PET strapping"
      ],
      [
        "Labels",
        "AIR CARGO ×2 + AWB pouch on piece 1"
      ]
    ]
  },
  {
    "id": "WIKI-114",
    "type": "PACK",
    "title": "Packing instruction — courier samples & documents (DHL)",
    "dept": "Shipping",
    "owner": "Tojo Velonjara",
    "status": "Published",
    "version": 4,
    "updated": dAgo(4),
    "tags": [
      "courier",
      "samples",
      "DHL",
      "packing"
    ],
    "linkOrder": null,
    "sections": [
      {
        "h": "Contents",
        "body": "TOP / fit samples + full shipping doc set (invoice, packing list, COO copy). One package per destination — never mix buyers."
      },
      {
        "h": "Deface rule",
        "body": "Mark samples 'SAMPLE — NOT FOR SALE' on the sleeve mark; unstamped samples get customs-valued at retail and the buyer pays duty twice."
      },
      {
        "h": "Waybill",
        "body": "HS code 6110 · incoterm DAP · declared value = cost only. Receiver phone number is mandatory or DHL holds the piece."
      },
      {
        "h": "Cut-off",
        "body": "TNR pickup 15:00 — book before 13:00. Post the tracking number in the activity thread the moment the label prints."
      },
      {
        "h": "Worked example",
        "body": "SH-4505 — ORD-1001 TOP samples + documents, DHL tracking JD014600003812345678, TNR → London LHR."
      }
    ],
    "carton": [
      [
        "Package",
        "Courier satchel or 30 × 25 × 15 box"
      ],
      [
        "Contents",
        "Samples + document set — one buyer per package"
      ],
      [
        "Weight",
        "SH-4505 example: 4 kg — max 10 kg per piece"
      ],
      [
        "Pouch",
        "Waybill + proforma invoice ×3 outside the box"
      ],
      [
        "Marking",
        "SAMPLE — NOT FOR SALE on each sample"
      ],
      [
        "Cut-off",
        "TNR pickup 15:00 — book by 13:00"
      ]
    ]
  },
  {
    "id": "WIKI-115",
    "type": "PACK",
    "title": "Packing instruction — assorted size-ratio pack (1:2:2:1)",
    "dept": "Shipping",
    "owner": "Tojo Velonjara",
    "status": "Published",
    "version": 2,
    "updated": dAgo(10),
    "tags": [
      "ratio",
      "assortment",
      "packing"
    ],
    "linkOrder": null,
    "sections": [
      {
        "h": "Ratio math",
        "body": "20 pcs per carton = 2 S + 8 M + 8 L + 2 XL. Scale to 10-pc cartons as 1 S + 4 M + 4 L + 1 XL."
      },
      {
        "h": "Rule",
        "body": "One colorway per carton unless the buyer portal marks the PO 'solid colour assorted size'. When in doubt — ask Merchandising before closing the carton."
      },
      {
        "h": "Labels",
        "body": "Buyer-portal barcode on every polybag + carton-content label showing the size breakdown (2-8-8-2) on the side mark."
      },
      {
        "h": "Verification",
        "body": "CC the size grid photo to merchandising for the first 5 cartons of every new PO."
      }
    ],
    "carton": [
      [
        "Carton",
        "Standard 60 × 40 × 50 per WIKI-112"
      ],
      [
        "Contents",
        "20 pcs = 2 S + 8 M + 8 L + 2 XL"
      ],
      [
        "Polybags",
        "Buyer-portal barcode label on every bag"
      ],
      [
        "Side mark",
        "Size breakdown 2-8-8-2 printed under the side mark"
      ],
      [
        "Colorway",
        "One per carton unless PO says assorted"
      ]
    ]
  }
],
    sessions: {},
    settings: {
      dyeStd: { waterLPkg: 60, powerKwhPkg: 1.2, steamKgPkg: 5 },
      name: 'Analamanga Knitwear Co.',
      address: 'Lot 42 Industrial Zone, Analamanga, Antananarivo 101, Madagascar',
      phone: '+261 34 12 345 67',
      email: 'trade@analamanga-knit.mg',
      vat: 'MG-VAT-3001199876',
      currency: 'USD'
    },
    activity: [
      { id: 'ACT-01', ts: '2026-09-17T09:12:00.000Z', dept: 'Merchandising', actor: 'Hery Andriamampianina', text: 'Created order ORD-1009 — ModeHaus Copenhagen, 9,500 pcs knit dress', refType: 'order', refId: 'ORD-1009' },
      { id: 'ACT-02', ts: '2026-09-17T08:40:00.000Z', dept: 'Purchase', actor: 'Niry Rakotomalala', text: 'Sent PO-2604 to AccuTrim Accessories — 120,000 woven labels', refType: 'po', refId: 'PO-2604' },
      { id: 'ACT-03', ts: '2026-09-17T08:05:00.000Z', dept: 'Shipping', actor: 'Tojo Velonjara', text: 'Packing started for SH-4502 (ORD-1004) — 395 cartons planned', refType: 'shipment', refId: 'SH-4502' },
      { id: 'ACT-04', ts: '2026-09-16T16:30:00.000Z', dept: 'Dye House', actor: 'Tiana Rabe', text: 'Batch DB-2612 Navy started on D-04 — 4,600 kg cotton yarn issued from store', refType: 'batch', refId: 'DB-2612' },
      { id: 'ACT-05', ts: '2026-09-16T15:10:00.000Z', dept: 'Merchandising', actor: 'Hery Andriamampianina', text: 'Raised 2 requisitions for ORD-1002 — 13,228 kg merino + labels', refType: 'order', refId: 'ORD-1002' },
      { id: 'ACT-06', ts: '2026-09-16T11:20:00.000Z', dept: 'Merchandising', actor: 'Hery Andriamampianina', text: 'ORD-1003 handed over to production — all shades passed QC', refType: 'order', refId: 'ORD-1003' },
      { id: 'ACT-07', ts: '2026-09-15T17:45:00.000Z', dept: 'Purchase', actor: 'Niry Rakotomalala', text: 'Placed PO-2603 with MerinoSource SA — 9,000 kg merino wool', refType: 'po', refId: 'PO-2603' },
      { id: 'ACT-08', ts: '2026-09-15T14:02:00.000Z', dept: 'Dye House', actor: 'Tiana Rabe', text: 'DB-2617 Oatmeal passed QC — ORD-1008 fabric ready', refType: 'batch', refId: 'DB-2617' },
      { id: 'ACT-09', ts: '2026-09-14T18:22:00.000Z', dept: 'Dye House', actor: 'Tiana Rabe', text: 'DB-2611 Tango Red passed QC on re-dye — shade matched', refType: 'batch', refId: 'DB-2611' },
      { id: 'ACT-10', ts: '2026-09-12T10:00:00.000Z', dept: 'Management', actor: 'Amina Rasoanaivo', text: 'Approved September production & shipment plan', refType: null, refId: null },
      { id: 'ACT-11', ts: '2026-09-10T09:30:00.000Z', dept: 'Shipping', actor: 'Tojo Velonjara', text: 'SH-4501 departed Toamasina on MSC Ambra V.226W — docs couriered', refType: 'shipment', refId: 'SH-4501' },
      { id: 'ACT-12', ts: '2026-09-08T15:45:00.000Z', dept: 'Purchase', actor: 'Niry Rakotomalala', text: 'PO-2605 received — 6,000 kg cotton yarn into yarn store', refType: 'po', refId: 'PO-2605' }
    ]
  };
}

function load() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      const fresh = seed();
      for (const k of Object.keys(fresh)) if (db[k] === undefined) db[k] = fresh[k];
      for (const k of Object.keys(fresh.seq)) if (db.seq[k] === undefined) db.seq[k] = fresh.seq[k];
      for (const u of fresh.users) if (!db.users.some(x => x.email === u.email)) db.users.push(u);
      for (const mc of db.machines || []) {
        if (mc.targetPerDay === undefined) mc.targetPerDay = mc.type === 'Knitting' ? 12 : 0;
        if (!mc.events) mc.events = [];
      }
      if (!db.bundles) db.bundles = [];
      if (!db.seq.bnd) db.seq.bnd = 5007;
      if (!db.settings.dyeStd) db.settings.dyeStd = { waterLPkg: 60, powerKwhPkg: 1.2, steamKgPkg: 5 };
      for (const sp of db.shipments || []) if (!sp.mode) sp.mode = 'Sea';
      for (const u of db.users) {
        if (u.password && !String(u.password).includes('$')) u.password = hashPassword(u.password);
        if (u.active === undefined) u.active = true;
      }
      if (!db.settings.wiki) db.settings.wiki = WIKI_ALL();
      return;
    }
    catch (e) { console.error('DB corrupt, reseeding:', e.message); }
  }
  db = seed();
  if (!db.settings.wiki) db.settings.wiki = WIKI_ALL();
  save();
}

let lastBackup = 0;
function save() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
  maybeBackup();
}
function maybeBackup() {
  const now = Date.now();
  if (now - lastBackup < 12 * 3600e3) return;
  lastBackup = now;
  try {
    const bdir = path.join(DATA_DIR, 'backups');
    if (!fs.existsSync(bdir)) fs.mkdirSync(bdir, { recursive: true });
    fs.copyFileSync(DB_FILE, path.join(bdir, 'db-' + new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19) + '.json'));
    const files = fs.readdirSync(bdir).sort();
    while (files.length > 14) fs.unlinkSync(path.join(bdir, files.shift()));
  } catch (e) { console.error('backup skipped:', e.message); }
}

/* ------------------------------------------------------------- helpers */

function json(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', c => { d += c; if (d.length > 1e6) req.destroy(); });
    req.on('end', () => {
      if (!d) return resolve({});
      try { resolve(JSON.parse(d)); } catch (e) { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function auth(req) {
  const h = req.headers['authorization'] || '';
  const m = h.match(/^Bearer (.+)$/);
  if (!m) return null;
  const sess = (db.sessions || {})[m[1]];
  if (!sess || sess.exp < Date.now()) return null;
  return db.users.find(u => u.id === sess.userId) || null;
}

function can(user, perm) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (Array.isArray(user.perms)) return user.perms.includes(perm);
  return (PERMS[user.role] || []).includes(perm);
}

function pub(u) { return u ? { id: u.id, name: u.name, email: u.email, role: u.role, title: u.title, dept: u.dept, perms: u.perms || null, active: u.active !== false } : null; }

function log(dept, actor, text, refType, refId) {
  db.activity.unshift({ id: 'ACT-' + (db.seq.act++), ts: new Date().toISOString(), dept, actor, text, refType: refType || null, refId: refId || null });
  if (db.activity.length > 400) db.activity.length = 400;
}

const fmtN = n => (Number(n) || 0).toLocaleString('en-US');

function maybeAdvance(order) {
  if (!order || ['Delivered'].includes(order.stage)) return;
  const reqs = db.requisitions.filter(r => r.orderId === order.id && r.status !== 'Rejected');
  if (order.stage === 'Material Sourcing' && reqs.length && reqs.every(r => r.status === 'Received')) {
    order.stage = 'Ready for Dyeing';
    log('Merchandising', 'System', 'All materials in-house for ' + order.id + ' — ready for dyeing', 'order', order.id);
  }
  const bs = db.batches.filter(b => b.orderId === order.id);
  const active = bs.filter(b => ['Queued', 'Dyeing', 'Drying', 'QC'].includes(b.status));
  if (order.stage === 'Ready for Dyeing' && active.some(b => ['Dyeing', 'Drying', 'QC'].includes(b.status))) {
    order.stage = 'Dyeing';
    log('Dye House', 'System', order.id + ' moved to Dyeing — first batch on the machines', 'order', order.id);
  }
  if (['Ready for Dyeing', 'Dyeing'].includes(order.stage) && bs.length && !active.length) {
    const allColorsPassed = order.colors.every(c => bs.some(b => b.color === c.name && b.status === 'Passed'));
    if (allColorsPassed) {
      order.stage = 'Fabric Ready';
      log('Dye House', 'System', 'All shades passed QC — dyed fabric ready for ' + order.id, 'order', order.id);
    }
  }
}

function autoRequisitions(order, actor) {
  const lines = [];
  const yarn = db.materials.find(m => m.id === order.yarnMaterialId);
  const kg = Math.round(order.qty * order.weightPerPc * 1.1);
  if (yarn) lines.push({ materialId: yarn.id, qty: kg, note: yarn.name + ' incl. 10% wastage' });
  const labels = db.materials.find(m => m.code === 'ACC-LBL-MAIN');
  if (labels) lines.push({ materialId: labels.id, qty: order.qty, note: 'Main + care labels' });
  const poly = db.materials.find(m => m.code === 'ACC-POLY-1215');
  if (poly) lines.push({ materialId: poly.id, qty: order.qty, note: 'Individual polybags' });
  if (Number(order.buttonsPerPc) > 0) {
    const btn = db.materials.find(m => m.code === 'ACC-BTN-15');
    if (btn) lines.push({ materialId: btn.id, qty: order.qty * order.buttonsPerPc, note: 'Buttons @ ' + order.buttonsPerPc + '/pc' });
  }
  for (const l of lines) {
    db.requisitions.unshift({
      id: 'R-' + (db.seq.req++), orderId: order.id, materialId: l.materialId, qty: l.qty,
      status: 'Pending Approval', note: l.note, poId: null, createdAt: new Date().toISOString(), createdBy: actor.id
    });
  }
  log('Merchandising', actor.name, 'Raised ' + lines.length + ' requisitions for ' + order.id, 'order', order.id);
  return lines.length;
}

/* ------------------------------------------------------- doc templates */

function docHtml(title, shipment, order, buyer, inner) {
  const C = db.settings || COMPANY;
  const logoImg = C.logo ? '<img src="' + C.logo + '" style="max-height:64px;max-width:300px;display:block;margin-bottom:10px">' : '';
  return '<!doctype html><html><head><meta charset="utf-8"><title>' + title + ' — ' + shipment.id + '</title>' +
    '<style>' +
    'body{font-family:Georgia,"Times New Roman",serif;margin:0;color:#1e293b;background:#f8fafc}' +
    '.sheet{max-width:820px;margin:24px auto;background:#fff;padding:48px 56px;box-shadow:0 4px 24px rgba(2,6,23,.12)}' +
    '.band{height:10px;background:linear-gradient(90deg,#4F46E5,#8B5CF6 40%,#0EA5E9);margin:-48px -56px 40px}' +
    'h1{font-size:22px;letter-spacing:3px;text-transform:uppercase;margin:0 0 4px;color:#0f172a}' +
    '.co{font-size:13px;color:#475569;line-height:1.5}' +
    'table{width:100%;border-collapse:collapse;margin-top:18px;font-size:13px}' +
    'th{background:#0f172a;color:#fff;text-align:left;padding:8px 10px;font-size:11px;letter-spacing:1px;text-transform:uppercase}' +
    'td{border-bottom:1px solid #e2e8f0;padding:8px 10px}' +
    '.meta{display:flex;justify-content:space-between;gap:24px;margin-top:26px;font-size:13px}' +
    '.meta div{flex:1}' +
    '.meta h4{margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#64748b}' +
    '.tot{margin-top:14px;text-align:right;font-size:15px;font-weight:bold}' +
    '.foot{margin-top:48px;display:flex;justify-content:space-between;font-size:12px;color:#64748b}' +
    '.sign{border-top:1px solid #94a3b8;margin-top:64px;width:220px;padding-top:6px;text-align:center;font-size:12px}' +
    '@media print{body{background:#fff}.sheet{box-shadow:none;margin:0}}' +
    '</style></head><body><div class="sheet"><div class="band"></div>' +
    logoImg + '<h1>' + C.name + '</h1><div class="co">' + C.address + '<br>Phone ' + C.phone + ' · ' + C.email + ' · ' + C.vat + '</div>' +
    '<h1 style="margin-top:28px;border-bottom:2px solid #0f172a;padding-bottom:8px">' + title + '</h1>' + inner +
    '<div class="foot"><div>' + title + ' ' + shipment.id + ' · Generated by KnitFlow OS on ' + new Date().toISOString().slice(0, 10) + '</div><div>Page 1 of 1</div></div>' +
    '</div></body></html>';
}

function buildDoc(type, shipId) {
  const S = db.settings || COMPANY;
  const ship = db.shipments.find(s => s.id === shipId);
  if (!ship) return null;
  const order = db.orders.find(o => o.id === ship.orderId) || {};
  const buyer = db.buyers.find(b => b.id === order.buyerId) || {};
  const rows = (order.colors || []).map((c, i) => {
    const pcs = Math.round(order.qty * c.share / 100);
    return '<tr><td>' + (i + 1) + '</td><td>' + c.name + ' — ' + c.hex + '</td><td style="text-align:right">' + fmtN(pcs) + ' pcs</td>' +
      (type === 'invoice' ? '<td style="text-align:right">$' + order.unitPrice.toFixed(2) + '</td><td style="text-align:right">$' + fmtN(pcs * order.unitPrice) + '</td>' : '<td>' + ship.cartons + ' ctns (split)</td>') + '</tr>';
  }).join('');
  const total = order.qty * order.unitPrice;
  let inner;
  if (type === 'invoice') {
    inner = '<div class="meta">' +
      '<div><h4>Sold to</h4><b>' + (buyer.name || '-') + '</b><br>' + (buyer.country || '') + '<br>Attn: ' + (buyer.contact || '-') + '</div>' +
      '<div style="text-align:right"><h4>Invoice details</h4>Invoice No: <b>INV-' + ship.id.replace('SH-', '') + '</b><br>Date: ' + new Date().toISOString().slice(0, 10) + '<br>Order: ' + order.id + ' (' + (order.po || '-') + ')<br>Incoterm: ' + (order.incoterm || 'FOB') + ' Toamasina</div></div>' +
      '<table><tr><th>#</th><th>Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Unit Price</th><th style="text-align:right">Amount</th></tr>' +
      '<tr><td colspan="5"><b>' + order.style + ' · ' + (order.gauge || '') + ' · ' + (order.yarnMaterialId || '') + '</b></td></tr>' + rows +
      '</table><div class="tot">Total Value: $' + fmtN(total.toFixed(2)) + ' USD</div>' +
      '<p style="font-size:12px;color:#475569;margin-top:18px">Payment: 100% irrevocable LC at sight · Origin: Madagascar · HS Code 6110 (knitted garments)</p>';
  } else {
    inner = '<div class="meta">' +
      '<div><h4>Ship to</h4><b>' + (buyer.name || '-') + '</b><br>' + ship.portDischarge + '</div>' +
      '<div style="text-align:right"><h4>Shipment details</h4>Packing List No: <b>PL-' + ship.id.replace('SH-', '') + '</b><br>Date: ' + new Date().toISOString().slice(0, 10) + '<br>' + ((ship.mode === 'Air') ? 'Flight: ' + (ship.flightNo || '—') + ' · AWB: ' + (ship.airwaybill || '—') : (ship.mode === 'Courier') ? (ship.carrier || 'Courier') + ' · Tracking: ' + (ship.trackingNo || '—') : 'Vessel: ' + (ship.vessel || '—') + ' · Booking: ' + (ship.booking || '—')) + '</div></div>' +
      '<table><tr><th>#</th><th>Color / Shade</th><th style="text-align:right">Quantity</th><th>Cartons</th></tr>' +
      '<tr><td colspan="4"><b>' + order.style + ' · ' + (order.gauge || '') + '</b></td></tr>' + rows + '</table>' +
      '<table><tr><th>Metric</th><th style="text-align:right">Value</th></tr>' +
      '<tr><td>Total cartons</td><td style="text-align:right">' + fmtN(ship.cartons) + '</td></tr>' +
      '<tr><td>Volume</td><td style="text-align:right">' + fmtN(ship.cbm) + ' CBM</td></tr>' +
      '<tr><td>Gross weight</td><td style="text-align:right">' + fmtN(ship.grossKg) + ' kg</td></tr>' +
      '<tr><td>Net weight (approx)</td><td style="text-align:right">' + fmtN(Math.round(ship.grossKg * 0.89)) + ' kg</td></tr></table>' +
      '<p style="font-size:12px;color:#475569;margin-top:18px">Country of origin: Madagascar · Loaded at ' + ship.portLoading + ' · ETD ' + ship.etd + ' / ETA ' + ship.eta + '</p>';
  }
  inner += '<div class="sign">Authorized Signature</div>';
  return docHtml(type === 'invoice' ? 'Commercial Invoice' : 'Packing List', ship, order, buyer, inner);
}

/* ----------------------------------------------------------- reports */

function reportShell(title, bodyInner) {
  const S = db.settings || COMPANY;
  const logoImg = S.logo ? '<img src="' + S.logo + '" style="max-height:56px;max-width:280px;display:block;margin-bottom:8px">' : '';
  return '<!doctype html><html><head><meta charset="utf-8"><title>' + title + '</title><style>' +
    'body{font-family:"Segoe UI",Arial,sans-serif;margin:0;color:#0f172a;background:#f1f5f9}' +
    '.sheet{max-width:920px;margin:24px auto;background:#fff;padding:44px 52px;box-shadow:0 4px 24px rgba(2,6,23,.12)}' +
    '.band{height:10px;background:linear-gradient(90deg,#4F46E5,#8B5CF6 40%,#0EA5E9);margin:-44px -52px 34px}' +
    'h1{font-size:19px;margin:0 0 2px}h2{font-size:12.5px;color:#64748b;font-weight:600;margin:0 0 20px}' +
    'table{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:10px}' +
    'th{background:#0f172a;color:#fff;text-align:left;padding:7px 9px;font-size:10.5px;letter-spacing:.8px;text-transform:uppercase}' +
    'td{border-bottom:1px solid #e2e8f0;padding:7px 9px}td.r,th.r{text-align:right}' +
    '.tot{margin-top:14px;text-align:right;font-weight:bold;font-size:14px}' +
    '.foot{margin-top:34px;font-size:11px;color:#64748b;display:flex;justify-content:space-between}' +
    '@media print{body{background:#fff}.sheet{box-shadow:none;margin:0}}' +
    '</style></head><body><div class="sheet"><div class="band"></div>' +
    logoImg + '<h1>' + S.name + ' — ' + title + '</h1><h2>As of ' + new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) + ' · generated by KnitFlow OS</h2>' +
    bodyInner +
    '<div class="foot"><span>' + S.name + ' · ' + S.vat + '</span><span>KnitFlow OS — internal report</span></div></div></body></html>';
}

function buildReport(type) {
  const M = n => '$' + Math.round(n).toLocaleString('en-US');
  const T = { 'order-book': 'Order Book', 'shipment-schedule': 'Shipment Schedule', 'production-wip': 'Production WIP', 'dye-production': 'Dye House Production', 'purchase-spend': 'Purchase Spend by Supplier', 'inventory-valuation': 'Inventory Valuation', 'receivables': 'Receivables', 'payroll': 'Payroll Summary' };
  if (!T[type]) return null;
  let inner = '';
  if (type === 'order-book') {
    const rows = db.orders.map(o => { const b = db.buyers.find(x => x.id === o.buyerId) || {}; return '<tr><td>' + o.id + '</td><td>' + (b.name || '') + '</td><td>' + o.style + '</td><td class="r">' + fmtN(o.qty) + '</td><td class="r">' + M(o.qty * o.unitPrice) + '</td><td>' + (o.deliveryDate || '—') + '</td><td>' + o.stage + '</td></tr>'; }).join('');
    inner = '<table><tr><th>Order</th><th>Buyer</th><th>Style</th><th class="r">Qty</th><th class="r">Value</th><th>Delivery</th><th>Stage</th></tr>' + rows + '</table><div class="tot">Total order book: ' + M(db.orders.reduce((s, o) => s + o.qty * o.unitPrice, 0)) + '</div>';
  } else if (type === 'shipment-schedule') {
    const rows = db.shipments.map(s => { const o = db.orders.find(x => x.id === s.orderId) || {}; const b = db.buyers.find(x => x.id === o.buyerId) || {}; return '<tr><td>' + s.id + '</td><td>' + (b.name || '') + '</td><td>' + (o.po || '') + '</td><td>' + (s.portDischarge || '') + '</td><td>' + (s.vessel || '') + '</td><td>' + (s.etd || '') + '</td><td>' + (s.eta || '') + '</td><td>' + s.status + '</td></tr>'; }).join('');
    inner = '<table><tr><th>Shipment</th><th>Buyer</th><th>PO</th><th>Destination</th><th>Vessel</th><th>ETD</th><th>ETA</th><th>Status</th></tr>' + rows + '</table>';
  } else if (type === 'production-wip') {
    const rows = db.production.map(p => { const done = p.target ? Math.round(p.finish / p.target * 100) : 0; return '<tr><td>' + p.id + '</td><td>' + p.orderId + '</td><td class="r">' + fmtN(p.target) + '</td><td class="r">' + fmtN(p.knit) + '</td><td class="r">' + fmtN(p.cut) + '</td><td class="r">' + fmtN(p.sew) + '</td><td class="r">' + fmtN(p.finish) + ' (' + done + '%)</td><td>' + p.status + '</td></tr>'; }).join('');
    inner = '<table><tr><th>Prod. order</th><th>Order</th><th class="r">Target</th><th class="r">Knit</th><th class="r">Cut</th><th class="r">Sew</th><th class="r">Finished</th><th>Status</th></tr>' + rows + '</table>';
  } else if (type === 'dye-production') {
    const rows = db.batches.map(b => '<tr><td>' + b.id + '</td><td>' + b.orderId + '</td><td>' + b.color + '</td><td class="r">' + fmtN(b.qtyKg) + '</td><td>' + b.machine + '</td><td>' + (b.recipe || '—') + '</td><td>' + b.status + (b.reworks ? ' (rework #' + b.reworks + ')' : '') + '</td></tr>').join('');
    const passed = db.batches.filter(b => b.status === 'Passed').reduce((s, b) => s + b.qtyKg, 0);
    inner = '<table><tr><th>Batch</th><th>Order</th><th>Shade</th><th class="r">Qty</th><th>Machine</th><th>Recipe</th><th>Result</th></tr>' + rows + '</table><div class="tot">Total passed QC: ' + fmtN(passed) + ' kg</div>';
  } else if (type === 'purchase-spend') {
    const bySup = {};
    for (const po of db.pos) { const s = (db.suppliers.find(x => x.id === po.supplierId) || {}).name || po.supplierId; bySup[s] = (bySup[s] || 0) + po.items.reduce((a, i) => a + i.qty * i.rate, 0); }
    const rows = Object.entries(bySup).sort((a, b) => b[1] - a[1]).map(e => '<tr><td>' + e[0] + '</td><td class="r">' + M(e[1]) + '</td></tr>').join('');
    inner = '<table><tr><th>Supplier</th><th class="r">PO value YTD</th></tr>' + rows + '</table><div class="tot">Total: ' + M(Object.values(bySup).reduce((a, b) => a + b, 0)) + '</div>';
  } else if (type === 'inventory-valuation') {
    const rows = db.materials.map(mm => '<tr><td>' + mm.code + '</td><td>' + mm.name + '</td><td>' + mm.category + '</td><td class="r">' + fmtN(mm.stock) + ' ' + mm.unit + '</td><td class="r">$' + mm.cost + '</td><td class="r">' + M(mm.stock * mm.cost) + '</td></tr>').join('');
    inner = '<table><tr><th>Code</th><th>Material</th><th>Category</th><th class="r">Stock</th><th class="r">Unit cost</th><th class="r">Value</th></tr>' + rows + '</table><div class="tot">Total stock value: ' + M(db.materials.reduce((s, mm) => s + mm.stock * mm.cost, 0)) + '</div>';
  } else if (type === 'receivables') {
    const rows = db.invoices.map(v => { const paid = v.payments.reduce((a, p) => a + p.amount, 0); const b = db.buyers.find(x => x.id === v.buyerId) || {}; return '<tr><td>' + v.id + '</td><td>' + (b.name || '') + '</td><td>' + (v.issued || '') + '</td><td>' + (v.due || '') + '</td><td class="r">' + M(v.amount) + '</td><td class="r">' + M(paid) + '</td><td class="r">' + M(v.amount - paid) + '</td><td>' + v.status + '</td></tr>'; }).join('');
    const open = db.invoices.filter(v => v.status !== 'Paid').reduce((s, v) => s + v.amount - v.payments.reduce((a, p) => a + p.amount, 0), 0);
    inner = '<table><tr><th>Invoice</th><th>Buyer</th><th>Issued</th><th>Due</th><th class="r">Amount</th><th class="r">Paid</th><th class="r">Balance</th><th>Status</th></tr>' + rows + '</table><div class="tot">Open receivables: ' + M(open) + '</div>';
  } else if (type === 'payroll') {
    const rows = db.employees.map(e => '<tr><td>' + e.id + '</td><td>' + e.name + '</td><td>' + e.dept + '</td><td>' + e.position + '</td><td class="r">' + M(e.salary) + '</td></tr>').join('');
    inner = '<table><tr><th>ID</th><th>Employee</th><th>Department</th><th>Position</th><th class="r">Monthly salary</th></tr>' + rows + '</table><div class="tot">Monthly payroll: ' + M(db.employees.reduce((s, e) => s + e.salary, 0)) + '</div>';
  }
  return reportShell(T[type], inner);
}

/* ------------------------------------------------- security primitives */

function hashPassword(pw, salt) {
  salt = salt || crypto.randomBytes(8).toString('hex');
  return salt + '$' + crypto.createHash('sha256').update(salt + ':' + String(pw)).digest('hex');
}
function checkPassword(user, pw) {
  if (String(user.password || '').includes('$')) {
    const salt = user.password.split('$')[0];
    return hashPassword(pw, salt) === user.password;
  }
  return user.password === pw; // legacy plaintext (auto-upgraded at next login)
}
const loginFails = new Map(); // email -> {count, until}
function loginAllowed(email) {
  const lf = loginFails.get(email);
  if (!lf) return true;
  if (lf.until < Date.now()) { loginFails.delete(email); return true; }
  return lf.count < 5;
}
function loginFailed(email) {
  const lf = loginFails.get(email) || { count: 0, until: Date.now() + 15 * 60e3 };
  lf.count++;
  lf.until = Date.now() + 15 * 60e3;
  loginFails.set(email, lf);
}

/* ---------------------------------------------------------------- API */

async function apiRoute(req, res, p) {
  const method = req.method;
  let m;

  // ---- auth
  if (method === 'POST' && p === '/api/login') {
    const body = await readBody(req);
    const emailKey = String(body.email || '').toLowerCase().trim();
    if (!loginAllowed(emailKey)) return json(res, 429, { error: 'Too many failed attempts — locked for 15 minutes' });
    const user = db.users.find(u => u.email.toLowerCase() === emailKey);
    if (!user || !checkPassword(user, body.password)) {
      loginFailed(emailKey);
      return json(res, 401, { error: 'Invalid email or password' });
    }
    loginFails.delete(emailKey);
    if (user.active === false) return json(res, 403, { error: 'Account deactivated — contact Management' });
    if (!String(user.password).includes('$')) { user.password = hashPassword(body.password); } // upgrade legacy
    const token = crypto.randomBytes(18).toString('hex');
    db.sessions = db.sessions || {};
    for (const k of Object.keys(db.sessions)) if (db.sessions[k].exp < Date.now()) delete db.sessions[k];
    db.sessions[token] = { userId: user.id, exp: Date.now() + 7 * 864e5 };
    save();
    return json(res, 200, { token, user: pub(user) });
  }
  if (method === 'POST' && p === '/api/logout') {
    const h = req.headers['authorization'] || '';
    const mm = h.match(/^Bearer (.+)$/);
    if (mm) { delete (db.sessions || {})[mm[1]]; save(); }
    return json(res, 200, { ok: true });
  }

  const user = auth(req);
  if (!user) return json(res, 401, { error: 'Not authenticated' });

  // ---- directory / meta
  if (method === 'GET' && p === '/api/me') return json(res, 200, { user: pub(user) });
  if (method === 'GET' && p === '/api/users') return json(res, 200, { users: db.users.map(pub) });
  if (method === 'GET' && p === '/api/buyers') return json(res, 200, { buyers: db.buyers });
  if (method === 'POST' && p === '/api/buyers') {
    if (!can(user, 'buyers')) return json(res, 403, { error: 'Merchandising department only' });
    const b = await readBody(req);
    const buyer = { id: 'B-' + (db.seq.buyer++), name: b.name, country: b.country, contact: b.contact, email: b.email };
    db.buyers.push(buyer);
    log('Merchandising', user.name, 'Added new buyer ' + buyer.name, null, null);
    save();
    return json(res, 201, buyer);
  }
  if (method === 'GET' && p === '/api/suppliers') return json(res, 200, { suppliers: db.suppliers });
  if (method === 'POST' && p === '/api/suppliers') {
    if (!can(user, 'suppliers')) return json(res, 403, { error: 'Purchase department only' });
    const b = await readBody(req);
    const sup = { id: 'S-' + (db.seq.supplier++), name: b.name, type: b.type, location: b.location, rating: Number(b.rating) || 4.0, email: b.email };
    db.suppliers.push(sup);
    log('Purchase', user.name, 'Registered supplier ' + sup.name, null, null);
    save();
    return json(res, 201, sup);
  }

  // ---- activity
  if (method === 'GET' && p === '/api/activity') return json(res, 200, { activity: db.activity });

  // ---- materials / inventory
  if (method === 'GET' && p === '/api/materials') return json(res, 200, { materials: db.materials });
  if (method === 'PATCH' && (m = p.match(/^\/api\/materials\/([\w-]+)$/))) {
    if (!can(user, 'materials')) return json(res, 403, { error: 'Purchase department only' });
    const mat = db.materials.find(x => x.id === m[1]);
    if (!mat) return json(res, 404, { error: 'Material not found' });
    const body = await readBody(req);
    const delta = Number(body.delta) || 0;
    mat.stock = Math.max(0, mat.stock + delta);
    log('Purchase', user.name, (delta >= 0 ? 'Received ' : 'Issued ') + fmtN(Math.abs(delta)) + ' ' + mat.unit + ' of ' + mat.name + (body.note ? ' — ' + body.note : ''), 'material', mat.id);
    save();
    return json(res, 200, mat);
  }

  // ---- orders
  if (method === 'GET' && p === '/api/orders') {
    const orders = db.orders.map(o => Object.assign({}, o, { buyerName: (db.buyers.find(b => b.id === o.buyerId) || {}).name, value: Math.round(o.qty * o.unitPrice) }));
    return json(res, 200, { orders });
  }
  if (method === 'POST' && p === '/api/orders') {
    if (!can(user, 'orders')) return json(res, 403, { error: 'Merchandising department only' });
    const b = await readBody(req);
    if (!b.buyerId || !b.style || !b.qty) return json(res, 400, { error: 'Buyer, style and quantity are required' });
    const order = {
      id: 'ORD-' + (db.seq.order++),
      po: b.po || '', buyerId: b.buyerId, style: b.style,
      qty: Number(b.qty), weightPerPc: Number(b.weightPerPc) || 0, unitPrice: Number(b.unitPrice) || 0,
      yarnMaterialId: b.yarnMaterialId || 'M-01', gauge: b.gauge || '12GG', incoterm: b.incoterm || 'FOB',
      buttonsPerPc: Number(b.buttonsPerPc) || 0,
      colors: (b.colors || []).map(c => ({ name: c.name, hex: c.hex || '#888888', share: Number(c.share) || 0 })),
      deliveryDate: b.deliveryDate || '', stage: 'Material Sourcing',
      createdAt: new Date().toISOString(), createdBy: user.id
    };
    db.orders.unshift(order);
    log('Merchandising', user.name, 'Created order ' + order.id + ' — ' + (db.buyers.find(x => x.id === order.buyerId) || {}).name + ', ' + fmtN(order.qty) + ' pcs', 'order', order.id);
    const n = autoRequisitions(order, user);
    maybeAdvance(order);
    save();
    return json(res, 201, Object.assign({}, order, { requisitionsRaised: n }));
  }
  if ((m = p.match(/^\/api\/orders\/([\w-]+)$/))) {
    const order = db.orders.find(o => o.id === m[1]);
    if (!order) return json(res, 404, { error: 'Order not found' });
    if (method === 'GET') {
      const buyer = db.buyers.find(b => b.id === order.buyerId) || {};
      const reqs = db.requisitions.filter(r => r.orderId === order.id).map(r => Object.assign({}, r, { materialName: (db.materials.find(x => x.id === r.materialId) || {}).name, unit: (db.materials.find(x => x.id === r.materialId) || {}).unit }));
      const pos = db.pos.filter(x => x.orderId === order.id).map(x => Object.assign({}, x, { supplierName: (db.suppliers.find(s => s.id === x.supplierId) || {}).name }));
      const batches = db.batches.filter(b => b.orderId === order.id);
      const ships = db.shipments.filter(s => s.orderId === order.id);
      const acts = db.activity.filter(a => a.refId === order.id).slice(0, 20);
      return json(res, 200, { order: Object.assign({}, order, { buyerName: buyer.name, buyer: buyer, value: Math.round(order.qty * order.unitPrice) }), requisitions: reqs, pos, batches, shipments: ships, activity: acts, yarn: db.materials.find(x => x.id === order.yarnMaterialId) || null, samples: db.samples.filter(s => s.orderId === order.id), production: db.production.filter(pr => pr.orderId === order.id), inspections: db.inspections.filter(i => i.orderId === order.id), costsheet: db.costsheets.find(c => c.orderId === order.id) || null });
    }
    if (method === 'PATCH') {
      if (!can(user, 'orders')) return json(res, 403, { error: 'Merchandising department only' });
      const body = await readBody(req);
      if (body.stage) {
        if (!STAGES.includes(body.stage)) return json(res, 400, { error: 'Unknown stage' });
        const from = order.stage;
        order.stage = body.stage;
        log('Merchandising', user.name, 'Moved ' + order.id + ': ' + from + ' → ' + body.stage, 'order', order.id);
      }
      save();
      return json(res, 200, order);
    }
  }
  if (method === 'POST' && (m = p.match(/^\/api\/orders\/([\w-]+)\/requisitions$/))) {
    if (!can(user, 'orders')) return json(res, 403, { error: 'Merchandising department only' });
    const order = db.orders.find(o => o.id === m[1]);
    if (!order) return json(res, 404, { error: 'Order not found' });
    const n = autoRequisitions(order, user);
    save();
    return json(res, 201, { raised: n });
  }

  // ---- requisitions
  if (method === 'GET' && p === '/api/requisitions') {
    const reqs = db.requisitions.map(r => {
      const mat = db.materials.find(x => x.id === r.materialId) || {};
      const ord = db.orders.find(o => o.id === r.orderId) || {};
      return Object.assign({}, r, { materialName: mat.name, unit: mat.unit, orderPo: ord.po, buyerName: (db.buyers.find(b => b.id === ord.buyerId) || {}).name });
    });
    return json(res, 200, { requisitions: reqs });
  }
  if (method === 'POST' && (m = p.match(/^\/api\/requisitions\/([\w-]+)\/(approve|reject)$/))) {
    if (!can(user, 'reqs')) return json(res, 403, { error: 'Purchase department only' });
    const r = db.requisitions.find(x => x.id === m[1]);
    if (!r) return json(res, 404, { error: 'Requisition not found' });
    const mat = db.materials.find(x => x.id === r.materialId) || {};
    if (m[2] === 'approve') {
      r.status = 'Approved';
      log('Purchase', user.name, 'Approved requisition ' + r.id + ' — ' + fmtN(r.qty) + ' ' + (mat.unit || '') + ' ' + (mat.name || ''), 'req', r.id);
    } else {
      r.status = 'Rejected';
      log('Purchase', user.name, 'Rejected requisition ' + r.id, 'req', r.id);
    }
    save();
    return json(res, 200, r);
  }

  // ---- purchase orders
  if (method === 'GET' && p === '/api/pos') {
    const pos = db.pos.map(x => Object.assign({}, x, {
      supplierName: (db.suppliers.find(s => s.id === x.supplierId) || {}).name,
      orderPo: (db.orders.find(o => o.id === x.orderId) || {}).po || null,
      items: x.items.map(i => Object.assign({}, i, { materialName: (db.materials.find(mm => mm.id === i.materialId) || {}).name, unit: (db.materials.find(mm => mm.id === i.materialId) || {}).unit })),
      value: Math.round(x.items.reduce((s, i) => s + i.qty * i.rate, 0))
    }));
    return json(res, 200, { pos });
  }
  if (method === 'POST' && p === '/api/pos') {
    if (!can(user, 'pos')) return json(res, 403, { error: 'Purchase department only' });
    const b = await readBody(req);
    if (!b.supplierId || !b.items || !b.items.length) return json(res, 400, { error: 'Supplier and at least one item are required' });
    const po = {
      id: 'PO-' + (db.seq.po++), supplierId: b.supplierId, orderId: b.orderId || null,
      items: b.items.map(i => ({ materialId: i.materialId, qty: Number(i.qty), rate: Number(i.rate) })),
      status: 'Draft', eta: b.eta || '', requisitionIds: b.requisitionIds || [],
      createdAt: new Date().toISOString(), receivedAt: null
    };
    db.pos.unshift(po);
    for (const rid of po.requisitionIds) {
      const r = db.requisitions.find(x => x.id === rid);
      if (r) r.status = 'Ordered', r.poId = po.id;
    }
    const sup = (db.suppliers.find(s => s.id === po.supplierId) || {}).name;
    log('Purchase', user.name, 'Raised ' + po.id + ' to ' + sup + ' — ' + po.items.length + ' line(s), value $' + fmtN(po.items.reduce((s, i) => s + i.qty * i.rate, 0).toFixed(0)), 'po', po.id);
    save();
    return json(res, 201, po);
  }
  if (method === 'POST' && (m = p.match(/^\/api\/pos\/([\w-]+)\/send$/))) {
    if (!can(user, 'pos')) return json(res, 403, { error: 'Purchase department only' });
    const po = db.pos.find(x => x.id === m[1]);
    if (!po) return json(res, 404, { error: 'PO not found' });
    po.status = 'Sent';
    const sup = (db.suppliers.find(s => s.id === po.supplierId) || {}).name;
    log('Purchase', user.name, 'Sent ' + po.id + ' to ' + sup, 'po', po.id);
    save();
    return json(res, 200, po);
  }
  if (method === 'POST' && (m = p.match(/^\/api\/pos\/([\w-]+)\/receive$/))) {
    if (!can(user, 'pos')) return json(res, 403, { error: 'Purchase department only' });
    const po = db.pos.find(x => x.id === m[1]);
    if (!po) return json(res, 404, { error: 'PO not found' });
    if (po.status === 'Received') return json(res, 400, { error: 'PO already fully received' });
    const body = await readBody(req);
    const lines = (body.lines && body.lines.length) ? body.lines : po.items.map(i => ({ materialId: i.materialId, qty: i.qty }));
    for (const L of lines) {
      const mat = db.materials.find(x => x.id === L.materialId);
      if (mat) mat.stock = Math.max(0, mat.stock + (Number(L.qty) || 0));
    }
    let all = true;
    for (const it of po.items) {
      const rec = lines.filter(L => L.materialId === it.materialId).reduce((s, L) => s + (Number(L.qty) || 0), 0);
      if (rec < it.qty) all = false;
    }
    po.status = all ? 'Received' : 'Partial';
    po.receivedAt = new Date().toISOString();
    for (const rid of po.requisitionIds || []) {
      const r = db.requisitions.find(x => x.id === rid);
      if (r && all) r.status = 'Received';
    }
    const names = lines.map(L => { const mm = db.materials.find(x => x.id === L.materialId); return fmtN(L.qty) + ' ' + (mm ? mm.unit : '') + ' ' + (mm ? mm.name : ''); }).join(', ');
    log('Purchase', user.name, po.id + ' received into store — ' + names, 'po', po.id);
    if (po.orderId) { const o = db.orders.find(x => x.id === po.orderId); if (o) maybeAdvance(o); }
    save();
    return json(res, 200, po);
  }

  // ---- dye batches
  if (method === 'GET' && p === '/api/batches') {
    const std = db.settings.dyeStd || { waterLPkg: 60, powerKwhPkg: 1.2, steamKgPkg: 5 };
    const batches = db.batches.map(b => {
      const o = db.orders.find(x => x.id === b.orderId) || {};
      const waterPerKg = b.resources && b.qtyKg ? +(b.resources.waterL / b.qtyKg).toFixed(1) : null;
      const powerPerKg = b.resources && b.qtyKg ? +(b.resources.powerKwh / b.qtyKg).toFixed(2) : null;
      return Object.assign({}, b, { orderPo: o.po || '', orderStage: o.stage || '', waterPerKg, powerPerKg });
    });
    const passed = db.batches.filter(b => b.status === 'Passed');
    const passedKg = passed.reduce((sx, b) => sx + b.qtyKg, 0);
    const firstPassKg = passed.filter(b => !b.reworks).reduce((sx, b) => sx + b.qtyKg, 0);
    const withRes = passed.filter(b => b.resources);
    const waterAvg = withRes.length ? +(withRes.reduce((sx, b) => sx + b.resources.waterL / b.qtyKg, 0) / withRes.length).toFixed(1) : null;
    const powerAvg = withRes.length ? +(withRes.reduce((sx, b) => sx + b.resources.powerKwh / b.qtyKg, 0) / withRes.length).toFixed(2) : null;
    const dyeSummary = {
      rftPct: passedKg ? Math.round(firstPassKg / passedKg * 100) : 100,
      waterAvgLPkg: waterAvg, powerAvgKwhPkg: powerAvg, std
    };
    return json(res, 200, { batches, dyeSummary });
  }
  if (method === 'POST' && p === '/api/batches') {
    if (!can(user, 'batches')) return json(res, 403, { error: 'Dye House department only' });
    const b = await readBody(req);
    const order = db.orders.find(o => o.id === b.orderId);
    if (!order) return json(res, 400, { error: 'Select a valid order' });
    const colorObj = (order.colors.find(c => c.name === b.color) || { hex: '#888888' });
    const batch = {
      id: 'DB-' + (db.seq.batch++), orderId: order.id, color: b.color, hex: colorObj.hex,
      qtyKg: Number(b.qtyKg) || 0, machine: b.machine || 'D-01', recipe: b.recipe || '',
      yarnMaterialId: order.yarnMaterialId, status: 'Queued', reworks: 0,
      startedAt: null, doneAt: null, note: b.note || ''
    };
    db.batches.unshift(batch);
    log('Dye House', user.name, 'Scheduled batch ' + batch.id + ' — ' + order.id + ' ' + batch.color + ', ' + fmtN(batch.qtyKg) + ' kg on ' + batch.machine, 'batch', batch.id);
    maybeAdvance(order);
    save();
    return json(res, 201, batch);
  }
  if (method === 'POST' && (m = p.match(/^\/api\/batches\/([\w-]+)\/advance$/))) {
    if (!can(user, 'batches')) return json(res, 403, { error: 'Dye House department only' });
    const b = db.batches.find(x => x.id === m[1]);
    if (!b) return json(res, 404, { error: 'Batch not found' });
    const next = BATCH_NEXT[b.status];
    if (!next) return json(res, 400, { error: 'Batch cannot be advanced from ' + b.status });
    if (b.status === 'Queued') {
      const yarn = db.materials.find(x => x.id === b.yarnMaterialId);
      if (yarn && yarn.stock < b.qtyKg) {
        return json(res, 400, { error: 'Insufficient stock: ' + yarn.name + ' — ' + fmtN(yarn.stock) + ' ' + yarn.unit + ' available, need ' + fmtN(b.qtyKg) + ' ' + yarn.unit + '. Ask Purchase to bring material in.' });
      }
      if (yarn) yarn.stock -= b.qtyKg;
      b.startedAt = new Date().toISOString();
      log('Dye House', user.name, 'Batch ' + b.id + ' started on ' + b.machine + ' — ' + fmtN(b.qtyKg) + ' kg ' + (yarn ? yarn.name : 'yarn') + ' issued from store', 'batch', b.id);
    } else {
      log('Dye House', user.name, 'Batch ' + b.id + ' (' + b.color + ') moved to ' + next, 'batch', b.id);
    }
    b.status = next;
    const order = db.orders.find(o => o.id === b.orderId);
    if (order) maybeAdvance(order);
    save();
    return json(res, 200, b);
  }
  if (method === 'POST' && (m = p.match(/^\/api\/batches\/([\w-]+)\/complete$/))) {
    if (!can(user, 'batches')) return json(res, 403, { error: 'Dye House department only' });
    const b = db.batches.find(x => x.id === m[1]);
    if (!b) return json(res, 404, { error: 'Batch not found' });
    if (b.status !== 'QC') return json(res, 400, { error: 'Batch is not in QC' });
    const body = await readBody(req);
    if (body.pass) {
      b.status = 'Passed'; b.doneAt = new Date().toISOString();
      log('Dye House', user.name, 'Batch ' + b.id + ' (' + b.color + ') passed QC — ' + fmtN(b.qtyKg) + ' kg dyed fabric to floor', 'batch', b.id);
    } else {
      b.status = 'Rework'; b.reworks = (b.reworks || 0) + 1;
      b.note = 'Shade rejected in QC — re-dye #' + b.reworks;
      log('Dye House', user.name, 'Batch ' + b.id + ' (' + b.color + ') FAILED QC — sent for rework', 'batch', b.id);
    }
    const order = db.orders.find(o => o.id === b.orderId);
    if (order) maybeAdvance(order);
    save();
    return json(res, 200, b);
  }

  if (method === 'PATCH' && (m = p.match(/^\/api\/batches\/([\w-]+)\/resources$/))) {
    if (!can(user, 'batches')) return json(res, 403, { error: 'Dye House department only' });
    const b = db.batches.find(x => x.id === m[1]);
    if (!b) return json(res, 404, { error: 'Batch not found' });
    const body = await readBody(req);
    b.resources = { waterL: Number(body.waterL) || 0, powerKwh: Number(body.powerKwh) || 0, steamKg: Number(body.steamKg) || 0, chemCost: Number(body.chemCost) || 0 };
    const wkg = b.qtyKg ? (b.resources.waterL / b.qtyKg).toFixed(1) : '—';
    log('Dye House', user.name, 'Resources recorded for ' + b.id + ' — ' + wkg + ' L water/kg, ' + (b.qtyKg ? (b.resources.powerKwh / b.qtyKg).toFixed(2) : '—') + ' kWh/kg', 'batch', b.id);
    save();
    return json(res, 200, b);
  }

function parseContent(txt) {
  const out = []; let cur = null;
  for (const ln of String(txt).split(/\r?\n/)) {
    if (ln.startsWith('# ')) { cur = { h: ln.slice(2).trim(), body: '' }; out.push(cur); }
    else if (cur) cur.body += (cur.body ? '\n' : '') + ln;
    else if (ln.trim()) { cur = { h: 'Notes', body: ln }; out.push(cur); }
  }
  return out.filter(x => x.h || x.body);
}

  // ---- shipments
  if (method === 'GET' && p === '/api/shipments') {
    const ships = db.shipments.map(s => {
      const o = db.orders.find(x => x.id === s.orderId) || {};
      const b = db.buyers.find(x => x.id === o.buyerId) || {};
      return Object.assign({}, s, { orderPo: o.po || '', style: o.style || '', buyerName: b.name || '', incoterm: o.incoterm || 'FOB', orderQty: o.qty || 0, colors: o.colors || [] });
    });
    return json(res, 200, { shipments: ships });
  }
  if (method === 'POST' && p === '/api/shipments') {
    if (!can(user, 'shipments')) return json(res, 403, { error: 'Shipping department only' });
    const b = await readBody(req);
    const order = db.orders.find(o => o.id === b.orderId);
    if (!order) return json(res, 400, { error: 'Select a valid order' });
    if (['Shipped', 'Delivered'].includes(order.stage)) return json(res, 400, { error: 'Order already shipped' });
    const ship = {
      id: 'SH-' + (db.seq.ship++), orderId: order.id,
      mode: ['Sea', 'Air', 'Courier'].includes(b.mode) ? b.mode : 'Sea',
      cartons: Number(b.cartons) || 0, cbm: Number(b.cbm) || 0, grossKg: Number(b.grossKg) || 0,
      vessel: b.vessel || '', booking: b.booking || '',
      flightNo: b.flightNo || '', airwaybill: b.airwaybill || '',
      carrier: b.carrier || '', trackingNo: b.trackingNo || '',
      etd: b.etd || '', eta: b.eta || '',
      portLoading: b.portLoading || 'Toamasina (MGTGA)', portDischarge: b.portDischarge || '',
      note: b.note || '',
      status: 'Packing', createdAt: new Date().toISOString()
    };
    db.shipments.unshift(ship);
    log('Shipping', user.name, 'Created shipment ' + ship.id + ' for ' + order.id + ' — ' + fmtN(ship.cartons) + ' cartons, ETD ' + ship.etd, 'shipment', ship.id);
    if (['Production', 'Fabric Ready', 'Packing'].includes(order.stage) || true) {
      if (!['Shipped', 'Delivered'].includes(order.stage)) order.stage = 'Packing';
    }
    log('Shipping', user.name, order.id + ' moved to Packing — shipping took over', 'order', order.id);
    save();
    return json(res, 201, ship);
  }
  if (method === 'POST' && (m = p.match(/^\/api\/shipments\/([\w-]+)\/advance$/))) {
    if (!can(user, 'shipments')) return json(res, 403, { error: 'Shipping department only' });
    const s = db.shipments.find(x => x.id === m[1]);
    if (!s) return json(res, 404, { error: 'Shipment not found' });
    const next = SHIP_NEXT[s.status];
    if (!next) return json(res, 400, { error: 'Shipment already delivered' });
    s.status = next;
    const order = db.orders.find(o => o.id === s.orderId);
    if (next === 'Booked') log('Shipping', user.name, s.id + ' booked — space confirmed on ' + s.vessel, 'shipment', s.id);
    if (next === 'In Transit') {
      log('Shipping', user.name, s.id + ' loaded & sailed from ' + s.portLoading + ' on ' + s.vessel, 'shipment', s.id);
      if (order && order.stage !== 'Delivered') order.stage = 'Shipped';
      if (order) log('Shipping', user.name, order.id + ' marked Shipped — goodbye and godspeed', 'order', order.id);
    }
    if (next === 'Delivered') {
      log('Shipping', user.name, s.id + ' delivered to ' + s.portDischarge + ' — POD filed', 'shipment', s.id);
      if (order) { order.stage = 'Delivered'; log('Shipping', user.name, order.id + ' completed — full pipeline closed', 'order', order.id); }
    }
    save();
    return json(res, 200, s);
  }
  if (method === 'GET' && (m = p.match(/^\/api\/shipments\/([\w-]+)\/docs\/(packing-list|invoice)$/))) {
    const html = buildDoc(m[2], m[1]);
    if (!html) return json(res, 404, { error: 'Shipment not found' });
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(html);
  }

  // ---- wiki (SOPs, tech sheets, packing instructions) — everyone reads, everyone improves
  if (method === 'GET' && p === '/api/wiki') {
    const wa = db.settings.wiki || {};
    if (user.role !== 'admin' && Array.isArray(wa.read) && !wa.read.includes(user.dept)) return json(res, 403, { error: 'No access to the document library — ask Management' });
    return json(res, 200, { docs: db.wiki });
  }
  if (method === 'POST' && p === '/api/wiki') {
    const b = await readBody(req);
    const we = db.settings.wiki || {};
    if (user.role !== 'admin' && (!Array.isArray(we.edit) || !we.edit.includes(user.dept))) return json(res, 403, { error: 'Your department cannot edit the wiki — ask Management' });
    if (!b.title || !String(b.title).trim()) return json(res, 400, { error: 'Title is required' });
    const type = ['SOP', 'TECH', 'PACK'].includes(b.type) ? b.type : 'SOP';
    const doc = {
      id: 'WIKI-' + (db.seq.wiki++), type,
      title: String(b.title).trim(), dept: b.dept || 'Management', owner: b.owner || user.name,
      status: 'Published', version: 1, updated: new Date().toISOString().slice(0, 10),
      tags: String(b.tags || '').split(',').map(x => x.trim()).filter(Boolean),
      linkOrder: b.linkOrder || null,
      specs: [], poms: [], carton: [],
      sections: parseContent(b.content || '')
    };
    db.wiki.unshift(doc);
    log('Management', user.name, 'Published wiki doc ' + doc.id + ' — ' + doc.title, 'wiki', doc.id);
    save();
    return json(res, 201, doc);
  }
  if (method === 'PUT' && (m = p.match(/^\/api\/wiki\/([\w-]+)$/))) {
    const doc = db.wiki.find(x => x.id === m[1]);
    if (!doc) return json(res, 404, { error: 'Doc not found' });
    const we = db.settings.wiki || {};
    if (user.role !== 'admin' && (!Array.isArray(we.edit) || !we.edit.includes(user.dept))) return json(res, 403, { error: 'Your department cannot edit the wiki — ask Management' });
    const b = await readBody(req);
    if (b.title && String(b.title).trim()) doc.title = String(b.title).trim();
    if (['SOP', 'TECH', 'PACK'].includes(b.type)) doc.type = b.type;
    if (b.dept) doc.dept = b.dept;
    if (b.owner) doc.owner = b.owner;
    if (b.tags !== undefined) doc.tags = String(b.tags).split(',').map(x => x.trim()).filter(Boolean);
    if (b.linkOrder !== undefined) doc.linkOrder = b.linkOrder || null;
    if (b.content) doc.sections = parseContent(b.content);
    doc.version = (doc.version || 1) + 1;
    doc.updated = new Date().toISOString().slice(0, 10);
    log(doc.dept, user.name, 'Updated wiki doc ' + doc.id + ' — ' + doc.title + ' → v' + doc.version, 'wiki', doc.id);
    save();
    return json(res, 200, doc);
  }

  // ---- samples
  if (method === 'GET' && p === '/api/samples') {
    const samples = db.samples.map(s => {
      const o = db.orders.find(x => x.id === s.orderId) || {};
      return Object.assign({}, s, { style: o.style || '', buyerName: (db.buyers.find(b => b.id === o.buyerId) || {}).name || '' });
    });
    return json(res, 200, { samples });
  }
  if (method === 'POST' && p === '/api/samples') {
    if (!can(user, 'samples')) return json(res, 403, { error: 'Merchandising department only' });
    const b = await readBody(req);
    const order = db.orders.find(o => o.id === b.orderId);
    if (!order) return json(res, 400, { error: 'Select a valid order' });
    const smp = { id: 'SMP-' + (db.seq.sample++), orderId: order.id, type: b.type || 'Proto Sample', status: b.sentDate ? 'Sent' : 'Requested', sentDate: b.sentDate || null, approvedDate: null, note: b.note || '' };
    db.samples.unshift(smp);
    log('Merchandising', user.name, 'Sample ' + smp.id + ' (' + smp.type + ') requested for ' + order.id, 'sample', smp.id);
    save();
    return json(res, 201, smp);
  }
  if (method === 'PATCH' && (m = p.match(/^\/api\/samples\/([\w-]+)$/))) {
    if (!can(user, 'samples')) return json(res, 403, { error: 'Merchandising department only' });
    const smp = db.samples.find(x => x.id === m[1]);
    if (!smp) return json(res, 404, { error: 'Sample not found' });
    const b = await readBody(req);
    if (b.sentDate && !smp.sentDate) { smp.sentDate = b.sentDate; if (smp.status === 'Requested') smp.status = 'Sent'; }
    if (b.note) smp.note = b.note;
    if (b.status) {
      smp.status = b.status;
      if (b.status === 'Approved') smp.approvedDate = new Date().toISOString().slice(0, 10);
      log('Merchandising', user.name, 'Sample ' + smp.id + ' (' + smp.type + ') → ' + b.status + (b.note ? ' — ' + b.note : ''), 'sample', smp.id);
    }
    save();
    return json(res, 200, smp);
  }

  // ---- machines
  if (method === 'GET' && p === '/api/machines') {
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
    const machines = db.machines.map(mc => {
      const evs = (mc.events || []).filter(e => e.date >= weekAgo);
      const pcsToday = evs.filter(e => e.date === today && e.type === 'run').reduce((s, e) => s + (e.pcs || 0), 0);
      const produced7 = evs.filter(e => e.type === 'run').reduce((s, e) => s + (e.pcs || 0), 0);
      const downH7 = evs.filter(e => e.type === 'down').reduce((s, e) => s + (e.hours || 0), 0);
      const cap7 = (mc.targetPerDay || 0) * 7;
      return Object.assign({}, mc, { stats: {
        pcsToday, produced7, downHours7: downH7,
        utilization: cap7 ? Math.min(150, Math.round(produced7 / cap7 * 100)) : 0,
        targetToday: mc.targetPerDay || 0,
        lastEvents: (mc.events || []).slice(-5).reverse()
      } });
    });
    return json(res, 200, { machines });
  }
  if (method === 'PATCH' && (m = p.match(/^\/api\/machines\/([\w-]+)$/))) {
    if (!can(user, 'machines')) return json(res, 403, { error: 'Production department only' });
    const mc = db.machines.find(x => x.id === m[1]);
    if (!mc) return json(res, 404, { error: 'Machine not found' });
    const b = await readBody(req);
    const from = mc.status;
    if (b.status) mc.status = b.status;
    if (b.assigned !== undefined) mc.assigned = b.assigned || null;
    if (b.targetPerDay !== undefined) mc.targetPerDay = Math.max(0, Number(b.targetPerDay) || 0);
    if (b.status && b.status !== from) log('Production', user.name, 'Machine ' + mc.code + ' (' + mc.type + ') → ' + b.status + (mc.assigned ? ' · ' + mc.assigned : ''), 'machine', mc.id);
    save();
    return json(res, 200, mc);
  }

  if (method === 'POST' && (m = p.match(/^\/api\/machines\/([\w-]+)\/events$/))) {
    if (!can(user, 'machines')) return json(res, 403, { error: 'Production department only' });
    const mc = db.machines.find(x => x.id === m[1]);
    if (!mc) return json(res, 404, { error: 'Machine not found' });
    const b = await readBody(req);
    const type = b.type === 'down' ? 'down' : 'run';
    const ev = { date: b.date || new Date().toISOString().slice(0, 10), type };
    if (type === 'run') { ev.pcs = Math.max(0, Number(b.pcs) || 0); ev.hours = Math.max(0, Number(b.hours) || 0); }
    else { ev.hours = Math.max(0, Number(b.hours) || 0); ev.reason = b.reason || 'Unspecified'; }
    mc.events = mc.events || [];
    mc.events.push(ev);
    if (mc.events.length > 200) mc.events = mc.events.slice(-200);
    if (type === 'down') log('Production', user.name, 'Machine ' + mc.code + ' DOWN ' + ev.hours + 'h — ' + ev.reason, 'machine', mc.id);
    save();
    return json(res, 201, ev);
  }

  // ---- production
  if (method === 'GET' && p === '/api/production') {
    const prod = db.production.map(pr => {
      const o = db.orders.find(x => x.id === pr.orderId) || {};
      return Object.assign({}, pr, { style: o.style || '', orderStage: o.stage || '', orderPo: o.po || '' });
    });
    const knit = db.machines.filter(x => x.type === 'Knitting');
    const hoursPerDay = 20;
    const avgTarget = knit.length ? knit.reduce((sx, x) => sx + (x.targetPerDay || 12), 0) / knit.length : 12;
    let bookedHours = 0;
    for (const pr of db.production) {
      if (pr.status !== 'Open') continue;
      const remaining = Math.max(0, (pr.target || 0) - (pr.knit || 0));
      bookedHours += remaining / avgTarget * hoursPerDay;
    }
    const availableHoursWeek = knit.length * hoursPerDay * 7;
    const capacity = {
      machines: knit.length, hoursPerDay,
      avgTargetPerDay: Math.round(avgTarget),
      availableHoursWeek,
      bookedHours: Math.round(bookedHours),
      weeklyLoadPct: availableHoursWeek ? Math.min(100, Math.round(bookedHours / availableHoursWeek * 100)) : 0,
      weeksToClear: availableHoursWeek ? +(bookedHours / availableHoursWeek).toFixed(1) : 0
    };
    return json(res, 200, { production: prod, capacity });
  }
  if (method === 'POST' && p === '/api/production') {
    if (!can(user, 'production')) return json(res, 403, { error: 'Production department only' });
    const b = await readBody(req);
    const order = db.orders.find(o => o.id === b.orderId);
    if (!order) return json(res, 400, { error: 'Select a valid order' });
    if (db.production.some(pr => pr.orderId === order.id && pr.status !== 'Done')) return json(res, 400, { error: 'An active production order already exists for ' + order.id });
    const pr = { id: 'PROD-' + (db.seq.prod++), orderId: order.id, target: Number(b.target) || order.qty, knit: 0, cut: 0, sew: 0, finish: 0, machines: b.machines || [], status: 'Open', startedAt: new Date().toISOString().slice(0, 10), logs: [] };
    db.production.unshift(pr);
    log('Production', user.name, 'Production order ' + pr.id + ' opened for ' + order.id + ' — target ' + fmtN(pr.target) + ' pcs', 'production', pr.id);
    if (!['Production', 'Packing', 'Shipped', 'Delivered'].includes(order.stage)) {
      order.stage = 'Production';
      log('Production', user.name, order.id + ' moved to Production — floors started', 'order', order.id);
    }
    save();
    return json(res, 201, pr);
  }
  if (method === 'POST' && (m = p.match(/^\/api\/production\/([\w-]+)\/log$/))) {
    if (!can(user, 'production')) return json(res, 403, { error: 'Production department only' });
    const pr = db.production.find(x => x.id === m[1]);
    if (!pr) return json(res, 404, { error: 'Production order not found' });
    const b = await readBody(req);
    const floor = b.floor;
    if (!['Knitting', 'Cutting', 'Sewing', 'Finishing'].includes(floor)) return json(res, 400, { error: 'Unknown floor' });
    const pcs = Math.max(0, Number(b.pcs) || 0);
    const keyMap = { Knitting: 'knit', Cutting: 'cut', Sewing: 'sew', Finishing: 'finish' };
    pr[keyMap[floor]] = Math.min(pr.target, pr[keyMap[floor]] + pcs);
    pr.logs.unshift({ date: b.date || new Date().toISOString().slice(0, 10), floor, pcs });
    if (pr.logs.length > 60) pr.logs.length = 60;
    log('Production', user.name, pr.id + ' (' + pr.orderId + ') — ' + fmtN(pcs) + ' pcs at ' + floor + ' · total ' + fmtN(pr[keyMap[floor]]) + '/' + fmtN(pr.target), 'production', pr.id);
    save();
    return json(res, 200, pr);
  }
  if (method === 'POST' && (m = p.match(/^\/api\/production\/([\w-]+)\/complete$/))) {
    if (!can(user, 'production')) return json(res, 403, { error: 'Production department only' });
    const pr = db.production.find(x => x.id === m[1]);
    if (!pr) return json(res, 404, { error: 'Production order not found' });
    if (pr.status === 'Done') return json(res, 400, { error: 'Production order already completed' });
    pr.status = 'Done';
    const order = db.orders.find(o => o.id === pr.orderId);
    if (order && !['Packing', 'Shipped', 'Delivered'].includes(order.stage)) {
      order.stage = 'Packing';
      log('Production', user.name, order.id + ' finished on the floors — handed to Packing', 'order', order.id);
    }
    log('Production', user.name, 'Production order ' + pr.id + ' completed — ' + fmtN(pr.finish) + ' pcs finished', 'production', pr.id);
    save();
    return json(res, 200, pr);
  }

  // ---- bundle scanning (WIP track & trace)
  if (method === 'GET' && p === '/api/bundles') {
    const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
    const workers = {};
    for (const bd of db.bundles) for (const sc of (bd.scans || [])) {
      if (sc.date < weekAgo) continue;
      const k = sc.worker || 'Unknown';
      workers[k] = workers[k] || { worker: k, pcs: 0, floors: {} };
      workers[k].pcs += sc.pcs;
      workers[k].floors[sc.floor] = (workers[k].floors[sc.floor] || 0) + sc.pcs;
    }
    const bundles = db.bundles.map(bd => {
      const o = db.orders.find(x => x.id === bd.orderId) || {};
      const floorsDone = {};
      let last = null;
      for (const sc of (bd.scans || [])) { floorsDone[sc.floor] = (floorsDone[sc.floor] || 0) + sc.pcs; last = sc; }
      return Object.assign({}, bd, { style: o.style || '', po: o.po || '', floorsDone, position: last ? last.floor : 'Not started' });
    });
    return json(res, 200, { bundles, workers: Object.values(workers).sort((a, b) => b.pcs - a.pcs) });
  }
  if (method === 'POST' && p === '/api/bundles') {
    if (!can(user, 'production')) return json(res, 403, { error: 'Production department only' });
    const b = await readBody(req);
    const order = db.orders.find(o => o.id === b.orderId);
    if (!order) return json(res, 400, { error: 'Select a valid order' });
    const qty = Math.max(1, Number(b.qty) || 0);
    const count = Math.min(50, Math.max(1, Number(b.count) || 1));
    const created = [];
    for (let i = 0; i < count; i++) {
      db.seq.bnd = (db.seq.bnd || 5007) + 1;
      const bd = { id: 'BND-' + db.seq.bnd, barcode: String(100000 + db.seq.bnd), orderId: order.id, qty, scans: [] };
      db.bundles.unshift(bd);
      created.push(bd);
    }
    log('Production', user.name, 'Created ' + count + ' scan bundles for ' + order.id + ' — ' + fmtN(qty) + ' pcs each', 'production', order.id);
    save();
    return json(res, 201, { created });
  }
  if (method === 'POST' && p === '/api/scan') {
    if (!can(user, 'production')) return json(res, 403, { error: 'Production department only' });
    const b = await readBody(req);
    const bd = db.bundles.find(x => x.barcode === String(b.barcode || '').trim());
    if (!bd) return json(res, 404, { error: 'Barcode not found — check the label' });
    const FLOORS = ['Knitting', 'Cutting', 'Sewing', 'Finishing'];
    if (!FLOORS.includes(b.floor)) return json(res, 400, { error: 'Unknown floor' });
    const pcs = Math.max(1, Number(b.pcs) || 0);
    const done = (bd.scans || []).filter(sx => sx.floor === b.floor).reduce((sx, x) => sx + x.pcs, 0);
    if (done + pcs > bd.qty) return json(res, 400, { error: 'Exceeds bundle quantity (' + bd.qty + ' pcs) — already scanned ' + done });
    bd.scans.push({ floor: b.floor, pcs, worker: b.worker || '', date: new Date().toISOString().slice(0, 10) });
    const pr = db.production.find(x => x.orderId === bd.orderId && x.status !== 'Done');
    let prodUpdated = false;
    if (pr) {
      const keyMap = { Knitting: 'knit', Cutting: 'cut', Sewing: 'sew', Finishing: 'finish' };
      const k = keyMap[b.floor];
      pr[k] = Math.min(pr.target, pr[k] + pcs);
      pr.logs.unshift({ date: new Date().toISOString().slice(0, 10), floor: b.floor, pcs });
      if (pr.logs.length > 60) pr.logs.length = 60;
      prodUpdated = true;
    }
    save();
    return json(res, 200, { bundle: bd, prodUpdated });
  }

  // ---- quality inspections
  if (method === 'GET' && p === '/api/inspections') {
    const inspections = db.inspections.map(i => {
      const o = db.orders.find(x => x.id === i.orderId) || {};
      return Object.assign({}, i, { style: o.style || '' });
    });
    return json(res, 200, { inspections });
  }
  if (method === 'POST' && p === '/api/inspections') {
    if (!can(user, 'inspections')) return json(res, 403, { error: 'Quality Control department only' });
    const b = await readBody(req);
    const order = db.orders.find(o => o.id === b.orderId);
    if (!order) return json(res, 400, { error: 'Select a valid order' });
    const result = ['Pass', 'Fail', 'Pending'].includes(b.result) ? b.result : 'Pending';
    const ins = { id: 'QC-' + (db.seq.qc++), orderId: order.id, shipmentId: b.shipmentId || null, type: b.type || 'Final AQL 2.5', sampleSize: Number(b.sampleSize) || 0, crit: Number(b.crit) || 0, major: Number(b.major) || 0, minor: Number(b.minor) || 0, result, inspector: user.name, date: result === 'Pending' ? null : new Date().toISOString().slice(0, 10), note: b.note || '' };
    db.inspections.unshift(ins);
    log('Quality Control', user.name, ins.id + ' (' + ins.type + ') on ' + order.id + ' — sample ' + fmtN(ins.sampleSize) + ' pcs → ' + ins.result.toUpperCase(), 'inspection', ins.id);
    save();
    return json(res, 201, ins);
  }
  if (method === 'PATCH' && (m = p.match(/^\/api\/inspections\/([\w-]+)$/))) {
    if (!can(user, 'inspections')) return json(res, 403, { error: 'Quality Control department only' });
    const ins = db.inspections.find(x => x.id === m[1]);
    if (!ins) return json(res, 404, { error: 'Inspection not found' });
    const b = await readBody(req);
    if (b.result) {
      ins.result = b.result;
      ins.date = new Date().toISOString().slice(0, 10);
      if (b.crit !== undefined) ins.crit = Number(b.crit) || 0;
      if (b.major !== undefined) ins.major = Number(b.major) || 0;
      if (b.minor !== undefined) ins.minor = Number(b.minor) || 0;
      log('Quality Control', user.name, ins.id + ' (' + ins.orderId + ') → ' + b.result.toUpperCase() + ' — ' + ins.crit + ' critical / ' + ins.major + ' major / ' + ins.minor + ' minor', 'inspection', ins.id);
    }
    if (b.note) ins.note = b.note;
    save();
    return json(res, 200, ins);
  }

  // ---- HR
  if (method === 'GET' && p === '/api/hr') {
    const today = new Date().toISOString().slice(0, 10);
    const att = db.attendance[today] || {};
    const byDept = {};
    for (const e of db.employees) {
      byDept[e.dept] = byDept[e.dept] || { headcount: 0, payroll: 0 };
      byDept[e.dept].headcount++;
      byDept[e.dept].payroll += e.salary;
    }
    return json(res, 200, { employees: db.employees, attendance: att, date: today, byDept, totalPayroll: db.employees.reduce((s, e) => s + e.salary, 0) });
  }
  if (method === 'POST' && p === '/api/employees') {
    if (!can(user, 'hr')) return json(res, 403, { error: 'HR department only' });
    const b = await readBody(req);
    if (!b.name || !b.dept) return json(res, 400, { error: 'Name and department are required' });
    const e = { id: 'E-' + (db.seq.emp++), name: b.name, dept: b.dept, position: b.position || '', joined: b.joined || new Date().toISOString().slice(0, 10), salary: Number(b.salary) || 0, status: 'Active' };
    db.employees.push(e);
    log('Human Resources', user.name, 'Onboarded ' + e.name + ' — ' + (e.position || 'team member') + ' (' + e.dept + ')', 'employee', e.id);
    save();
    return json(res, 201, e);
  }
  if (method === 'POST' && p === '/api/attendance') {
    if (!can(user, 'hr')) return json(res, 403, { error: 'HR department only' });
    const b = await readBody(req);
    const date = b.date || new Date().toISOString().slice(0, 10);
    db.attendance[date] = Object.assign({}, db.attendance[date] || {}, b.records || {});
    const rec = b.records || {};
    const p_ = Object.values(rec).filter(v => v === 'P').length;
    log('Human Resources', user.name, 'Attendance saved for ' + date + ' — ' + p_ + ' present / ' + Object.keys(rec).length + ' recorded', null, null);
    save();
    return json(res, 200, db.attendance[date]);
  }

  // ---- Finance
  if (method === 'GET' && p === '/api/finance') {
    const invoices = db.invoices.map(v => Object.assign({}, v, {
      buyerName: (db.buyers.find(b => b.id === v.buyerId) || {}).name || '',
      orderPo: (db.orders.find(o => o.id === v.orderId) || {}).po || '',
      paid: v.payments.reduce((a, p) => a + p.amount, 0)
    }));
    const costsheets = db.costsheets.map(c => {
      const o = db.orders.find(x => x.id === c.orderId) || {};
      return Object.assign({}, c, { style: o.style || '', qty: o.qty || 0, unitPrice: o.unitPrice || 0 });
    });
    const now = new Date();
    const monthKey = now.toISOString().slice(0, 7);
    const summary = {
      receivableOpen: db.invoices.filter(v => v.status !== 'Paid').reduce((s, v) => s + (v.amount - v.payments.reduce((a, p) => a + p.amount, 0)), 0),
      overdue: db.invoices.filter(v => v.status !== 'Paid' && v.due && new Date(v.due) < now).reduce((s, v) => s + (v.amount - v.payments.reduce((a, p) => a + p.amount, 0)), 0),
      collected: db.invoices.reduce((s, v) => s + v.payments.reduce((a, p) => a + p.amount, 0), 0),
      expensesMonth: db.expenses.filter(x => (x.date || '').startsWith(monthKey)).reduce((s, x) => s + x.amount, 0)
    };
    summary.netMonth = summary.collected - summary.expensesMonth;
    return json(res, 200, { invoices, expenses: db.expenses, costsheets, summary });
  }
  if (method === 'POST' && p === '/api/invoices') {
    if (!can(user, 'finance')) return json(res, 403, { error: 'Finance department only' });
    const b = await readBody(req);
    const ship = db.shipments.find(s => s.id === b.shipmentId);
    if (!ship) return json(res, 400, { error: 'Select a valid shipment' });
    const order = db.orders.find(o => o.id === ship.orderId) || {};
    const inv = { id: 'INV-' + ship.id.replace('SH-', ''), shipmentId: ship.id, orderId: ship.orderId, buyerId: order.buyerId || null, amount: Number(b.amount) || Math.round((order.qty || 0) * (order.unitPrice || 0)), status: 'Open', issued: new Date().toISOString().slice(0, 10), due: b.due || '', payments: [] };
    if (db.invoices.some(v => v.id === inv.id)) return json(res, 400, { error: 'Invoice already exists for ' + ship.id });
    db.invoices.unshift(inv);
    log('Finance', user.name, 'Invoice ' + inv.id + ' issued — ' + ((db.buyers.find(x => x.id === inv.buyerId) || {}).name || 'buyer') + ' · $' + fmtN(inv.amount), 'invoice', inv.id);
    save();
    return json(res, 201, inv);
  }
  if (method === 'POST' && (m = p.match(/^\/api\/invoices\/([\w-]+)\/payment$/))) {
    if (!can(user, 'finance')) return json(res, 403, { error: 'Finance department only' });
    const inv = db.invoices.find(x => x.id === m[1]);
    if (!inv) return json(res, 404, { error: 'Invoice not found' });
    const b = await readBody(req);
    const amt = Number(b.amount) || 0;
    if (amt <= 0) return json(res, 400, { error: 'Payment amount must be positive' });
    inv.payments.push({ date: new Date().toISOString().slice(0, 10), amount: amt, ref: b.ref || 'TT' });
    const paid = inv.payments.reduce((s, p) => s + p.amount, 0);
    inv.status = paid >= inv.amount - 0.5 ? 'Paid' : 'Partial';
    log('Finance', user.name, 'Payment on ' + inv.id + ' — $' + fmtN(amt) + ' (' + (b.ref || 'TT') + ') → ' + inv.status, 'invoice', inv.id);
    save();
    return json(res, 200, inv);
  }
  if (method === 'POST' && p === '/api/expenses') {
    if (!can(user, 'finance')) return json(res, 403, { error: 'Finance department only' });
    const b = await readBody(req);
    const ex = { id: 'EX-' + (db.seq.ex++), date: b.date || new Date().toISOString().slice(0, 10), category: b.category || 'Other', desc: b.desc || '', amount: Number(b.amount) || 0 };
    db.expenses.unshift(ex);
    log('Finance', user.name, 'Expense booked — ' + ex.category + ' $' + fmtN(ex.amount) + (ex.desc ? ' (' + ex.desc + ')' : ''), 'expense', ex.id);
    save();
    return json(res, 201, ex);
  }
  if (method === 'POST' && p === '/api/costsheets') {
    if (!can(user, 'finance')) return json(res, 403, { error: 'Finance department only' });
    const b = await readBody(req);
    const order = db.orders.find(o => o.id === b.orderId);
    if (!order) return json(res, 400, { error: 'Select a valid order' });
    if (db.costsheets.some(c => c.orderId === order.id)) return json(res, 400, { error: 'Costing sheet already exists for ' + order.id });
    const cs = { id: 'CS-' + order.id.replace('ORD-', ''), orderId: order.id, yarnKg: Number(b.yarnKg) || 0, yarnRate: Number(b.yarnRate) || 0, dyeChemPerKg: Number(b.dyeChemPerKg) || 0, trimsPerPc: Number(b.trimsPerPc) || 0, cmPerPc: Number(b.cmPerPc) || 0, overheadPct: Number(b.overheadPct) || 8, freightPerPc: Number(b.freightPerPc) || 0, note: b.note || '' };
    db.costsheets.unshift(cs);
    log('Finance', user.name, 'Costing sheet ' + cs.id + ' created for ' + order.id, 'costsheet', cs.id);
    save();
    return json(res, 201, cs);
  }
  if (method === 'PATCH' && (m = p.match(/^\/api\/costsheets\/([\w-]+)$/))) {
    if (!can(user, 'finance')) return json(res, 403, { error: 'Finance department only' });
    const cs = db.costsheets.find(x => x.id === m[1]);
    if (!cs) return json(res, 404, { error: 'Costing sheet not found' });
    const b = await readBody(req);
    for (const k of ['yarnKg', 'yarnRate', 'dyeChemPerKg', 'trimsPerPc', 'cmPerPc', 'overheadPct', 'freightPerPc']) {
      if (b[k] !== undefined) cs[k] = Number(b[k]) || 0;
    }
    if (b.note !== undefined) cs.note = b.note;
    log('Finance', user.name, 'Costing sheet ' + cs.id + ' updated', 'costsheet', cs.id);
    save();
    return json(res, 200, cs);
  }

  // ---- settings & user management (Management only)
  if (method === 'GET' && p === '/api/settings') return json(res, 200, { settings: db.settings });
  if (method === 'PATCH' && p === '/api/settings') {
    if (user.role !== 'admin') return json(res, 403, { error: 'Management only' });
    const b = await readBody(req);
    if (b.logo !== undefined && b.logo !== null && b.logo !== '') {
      if (typeof b.logo !== 'string' || !b.logo.startsWith('data:image/') || b.logo.length > 400000) return json(res, 400, { error: 'Logo must be an image under ~300 KB' });
    }
    if (b.logo === null) b.logo = '';
    if (b.wiki) {
      b.wiki = { read: ALL_DEPTS.filter(x => (b.wiki.read || []).includes(x)), edit: ALL_DEPTS.filter(x => (b.wiki.edit || []).includes(x)) };
    }
    db.settings = Object.assign({}, db.settings, b);
    log('Management', user.name, 'Updated company settings', null, null);
    save();
    return json(res, 200, db.settings);
  }
  if (method === 'POST' && p === '/api/users') {
    if (user.role !== 'admin') return json(res, 403, { error: 'Management only' });
    const b = await readBody(req);
    if (!b.name || !b.email || !b.password || !b.role) return json(res, 400, { error: 'Name, email, role and password are required' });
    if (db.users.some(u => u.email.toLowerCase() === String(b.email).toLowerCase())) return json(res, 400, { error: 'Email already in use' });
    const ROLE_DEPT = { merchandising: 'Merchandising', purchase: 'Purchase', dye: 'Dye House', shipping: 'Shipping', production: 'Production', qc: 'Quality Control', hr: 'Human Resources', finance: 'Finance', admin: 'Management' };
    const nu = { id: 'U-' + (db.seq.user++), name: b.name, email: b.email, password: hashPassword(b.password), role: b.role, title: b.title || ((ROLE_DEPT[b.role] || 'Management') + ' Team'), dept: ROLE_DEPT[b.role] || 'Management' };
    db.users.push(nu);
    log('Management', user.name, 'Created user ' + nu.name + ' — ' + nu.dept, 'user', nu.id);
    save();
    return json(res, 201, pub(nu));
  }
  if (method === 'PUT' && (m = p.match(/^\/api\/users\/([\w-]+)$/))) {
    if (user.role !== 'admin') return json(res, 403, { error: 'Management only' });
    const tu = db.users.find(x => x.id === m[1]);
    if (!tu) return json(res, 404, { error: 'User not found' });
    const b = await readBody(req);
    const wasAdmin = tu.role === 'admin';
    if (b.role && ['admin', 'merchandising', 'purchase', 'dye', 'shipping', 'production', 'qc', 'hr', 'finance'].includes(b.role)) {
      tu.role = b.role;
      const RD = { merchandising: 'Merchandising', purchase: 'Purchase', dye: 'Dye House', shipping: 'Shipping', production: 'Production', qc: 'Quality Control', hr: 'Human Resources', finance: 'Finance', admin: 'Management' };
      tu.dept = RD[b.role] || tu.dept;
    }
    if (b.title !== undefined) tu.title = String(b.title);
    if (b.perms !== undefined) tu.perms = Array.isArray(b.perms) ? b.perms.filter(x => VALID_PERMS.includes(x)) : null;
    if (b.active !== undefined) tu.active = !!b.active;
    if (wasAdmin && (tu.role !== 'admin' || tu.active === false)) {
      const otherAdmin = db.users.some(x => x.id !== tu.id && x.role === 'admin' && x.active !== false);
      if (!otherAdmin) return json(res, 400, { error: 'Cannot remove the last active admin' });
    }
    log('Management', user.name, 'Updated access for ' + tu.name + ' — role ' + tu.role + (tu.perms ? ', custom rights on ' + tu.perms.length + ' modules' : ', role default rights'), 'user', tu.id);
    save();
    return json(res, 200, pub(tu));
  }
  if (method === 'POST' && (m = p.match(/^\/api\/users\/([\w-]+)\/password$/))) {
    if (user.role !== 'admin') return json(res, 403, { error: 'Management only' });
    const tu = db.users.find(x => x.id === m[1]);
    if (!tu) return json(res, 404, { error: 'User not found' });
    const b = await readBody(req);
    if (!b.password || String(b.password).length < 6) return json(res, 400, { error: 'Password must be at least 6 characters' });
    tu.password = hashPassword(b.password);
    for (const k of Object.keys(db.sessions || {})) if (db.sessions[k].userId === tu.id) delete db.sessions[k];
    log('Management', user.name, 'Set a new password for ' + tu.name, 'user', tu.id);
    save();
    return json(res, 200, { ok: true });
  }
  if (method === 'POST' && p === '/api/auth/password') {
    const b = await readBody(req);
    if (!checkPassword(user, b.current || '')) return json(res, 400, { error: 'Current password is wrong' });
    if (!b.next || String(b.next).length < 6) return json(res, 400, { error: 'New password must be at least 6 characters' });
    user.password = hashPassword(b.next);
    log(user.dept, user.name, 'Changed their own password', null, null);
    save();
    return json(res, 200, { ok: true });
  }

  // ---- printable reports
  if (method === 'GET' && (m = p.match(/^\/api\/reports\/([\w-]+)$/))) {
    const html = buildReport(m[1]);
    if (!html) return json(res, 404, { error: 'Unknown report' });
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(html);
  }

  // ---- dashboard
  if (method === 'GET' && p === '/api/dashboard') {
    const orders = db.orders;
    const active = orders.filter(o => !['Shipped', 'Delivered'].includes(o.stage));
    const passed = db.batches.filter(b => b.status === 'Passed');
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 864e5);
    const kpis = {
      activeOrders: active.length,
      activeValue: active.reduce((s, o) => s + o.qty * o.unitPrice, 0),
      inDyeing: db.batches.filter(b => ['Dyeing', 'Drying', 'QC'].includes(b.status)).length,
      dyeingKg: db.batches.filter(b => ['Dyeing', 'Drying', 'QC'].includes(b.status)).reduce((s, b) => s + b.qtyKg, 0),
      openPOs: db.pos.filter(p => ['Draft', 'Sent', 'Partial'].includes(p.status)).length,
      openPOValue: db.pos.filter(p => ['Draft', 'Sent', 'Partial'].includes(p.status)).reduce((s, p) => s + p.items.reduce((a, i) => a + i.qty * i.rate, 0), 0),
      inTransit: db.shipments.filter(s => s.status === 'In Transit').length,
      dyedReadyKg: passed.reduce((s, b) => s + b.qtyKg, 0),
      lowStock: db.materials.filter(mm => mm.stock < mm.reorder).length,
      shippedValue: orders.filter(o => ['Shipped', 'Delivered'].includes(o.stage)).reduce((s, o) => s + o.qty * o.unitPrice, 0),
      receivable: db.invoices.filter(v => v.status !== 'Paid').reduce((s, v) => s + v.amount - v.payments.reduce((a, p) => a + p.amount, 0), 0),
      wipOrders: db.production.filter(pr => pr.status !== 'Done').length,
      samplesOpen: db.samples.filter(s => ['Requested', 'Comments'].includes(s.status)).length,
      qcPending: db.inspections.filter(i => i.result === 'Pending').length,
      headcount: db.employees.length
    };
    const stageCounts = STAGES.map(s => ({ stage: s, count: orders.filter(o => o.stage === s).length }));
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'), label: d.toLocaleString('en-US', { month: 'short' }) });
    }
    const shipmentsByMonth = months.map(mo => ({
      label: mo.label,
      count: db.shipments.filter(s => (s.etd || '').startsWith(mo.key)).length
    }));
    const tasks = {
      reqsPending: db.requisitions.filter(r => r.status === 'Pending Approval').length,
      qcQueue: db.batches.filter(b => b.status === 'QC').length,
      packingQueue: db.shipments.filter(s => s.status === 'Packing').length,
      arrivingPOs: db.pos.filter(p => p.status === 'Sent' && p.eta && new Date(p.eta) <= new Date(now.getTime() + 7 * 864e5)).length,
      dueSoon: orders.filter(o => !['Shipped', 'Delivered'].includes(o.stage) && o.deliveryDate && new Date(o.deliveryDate) <= in30).map(o => ({ id: o.id, style: o.style, deliveryDate: o.deliveryDate, stage: o.stage, buyerName: (db.buyers.find(b => b.id === o.buyerId) || {}).name })),
      rework: db.batches.filter(b => b.status === 'Rework').length,
      samplesWaiting: db.samples.filter(s => ['Requested', 'Comments'].includes(s.status)).length,
      inspectionsPending: db.inspections.filter(i => i.result === 'Pending').length
    };
    return json(res, 200, {
      kpis, stageCounts, shipmentsByMonth, tasks,
      lowStockList: db.materials.filter(mm => mm.stock < mm.reorder).map(mm => ({ id: mm.id, code: mm.code, name: mm.name, stock: mm.stock, reorder: mm.reorder, unit: mm.unit })),
      recentActivity: db.activity.slice(0, 10)
    });
  }

  return json(res, 404, { error: 'Not found: ' + p });
}

/* ------------------------------------------------------------- static */

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };

function staticRoute(req, res, p) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end('Method not allowed'); }
  let f = p === '/' ? '/index.html' : p;
  let full = path.join(PUBLIC_DIR, path.normalize(f).replace(/^([.][.][/\\])+/, ''));
  if (!full.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) full = path.join(PUBLIC_DIR, 'index.html');
  const ext = path.extname(full).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(full).pipe(res);
}

/* ------------------------------------------------------------- server */

async function handle(req, res) {
  const u = new URL(req.url, 'http://localhost');
  const p = u.pathname;
  if (p.startsWith('/api/')) return await apiRoute(req, res, p);
  return staticRoute(req, res, p);
}
// serialize API processing so concurrent writes can never interleave (data safety)
let writeChain = Promise.resolve();
const server = http.createServer((req, res) => {
  writeChain = writeChain.then(() => handle(req, res)).catch(e => {
    console.error(e);
    try { json(res, 500, { error: e.message || 'Server error' }); } catch (_) {}
  });
});

if (process.env.SEED_DUMP) { console.log(JSON.stringify(seed())); process.exit(0); }
load();
server.listen(PORT, '0.0.0.0', () => {
  console.log('KnitFlow OS running on http://0.0.0.0:' + PORT);
  console.log('Demo logins — password for all: knit123');
  db.users.forEach(u => console.log('  ' + u.email + '  (' + u.dept + ')'));
});
