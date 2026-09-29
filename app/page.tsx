"use client";

import {
  Bike,
  CalendarDays,
  Check,
  Download,
  Eraser,
  FileArchive,
  FileText,
  FolderOpen,
  HardDrive,
  Mail,
  Menu,
  PenLine,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { PointerEvent, useEffect, useMemo, useRef, useState } from "react";

type BatterySize = "48V 60A" | "48V 70A" | "48V 80A" | "Custom";
type AppView = "contract" | "dashboard";

type FileSystemWritableFileStream = WritableStream & {
  write(data: Blob | BufferSource | string): Promise<void>;
  close(): Promise<void>;
};

type FileSystemFileHandle = {
  createWritable(): Promise<FileSystemWritableFileStream>;
};

type FileSystemDirectoryHandle = {
  name: string;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
  requestPermission?(options?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
  queryPermission?(options?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
};

type BrowserWithStorageTools = Window &
  typeof globalThis & {
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
  };

type ContractForm = {
  renterName: string;
  phone: string;
  email: string;
  address: string;
  rentalStart: string;
  rentalEnd: string;
  bikeMakeModel: string;
  bikeFrameNumber: string;
  batterySerialNumber: string;
  batteryNumber: string;
  kmStart: string;
  kmEnd: string;
  fleetNumber: string;
  battery: BatterySize;
  customBattery: string;
  preTripCondition: string;
  returnCondition: string;
  helmet: boolean;
  bikeLock: boolean;
  deliveryBag: boolean;
  batteryLockCharger: boolean;
  gpsTracker: boolean;
  customAccessories: string[];
  weeklyFee: string;
  bond: string;
  renterSignature: string;
};

type StoredContract = {
  id: string;
  createdAt: string;
  renterName: string;
  email: string;
  phone: string;
  rentalStart: string;
  rentalEnd: string;
  attachmentCount: number;
  pdfSize: number;
  form?: ContractForm;
  attachmentNames?: string[];
};

type AttachmentFile = {
  id: string;
  file: File;
};

type Fonts = {
  regular: PDFFont;
  bold: PDFFont;
};

const emptyForm: ContractForm = {
  renterName: "",
  phone: "",
  email: "",
  address: "",
  rentalStart: "",
  rentalEnd: "",
  bikeMakeModel: "",
  bikeFrameNumber: "",
  batterySerialNumber: "",
  batteryNumber: "",
  kmStart: "",
  kmEnd: "",
  fleetNumber: "",
  battery: "48V 60A",
  customBattery: "",
  preTripCondition: "",
  returnCondition: "",
  helmet: false,
  bikeLock: false,
  deliveryBag: false,
  batteryLockCharger: false,
  gpsTracker: false,
  customAccessories: [],
  weeklyFee: "",
  bond: "",
  renterSignature: "",
};

const localDraftKey = "beyond-bikes-contract-draft";
const dbName = "beyond-bikes-contracts";
const storeName = "contracts";
const settingsStoreName = "settings";
const saveFolderKey = "save-folder";
const businessAddress = "768 Glen Huntly Rd, Caulfield South";
const green = rgb(0.02, 0.45, 0.2);
const lightGreen = rgb(0.9, 0.97, 0.92);
const highlightFill = rgb(1, 0.9, 0.76);
const warningFill = rgb(1, 0.94, 0.9);
const warningRed = rgb(0.9, 0.08, 0.05);
const ink = rgb(0.08, 0.1, 0.12);
const muted = rgb(0.42, 0.47, 0.52);
const line = rgb(0.72, 0.74, 0.76);

const requiredDocs = [
  "Visa or right-to-work document",
  "Driver licence or photo ID",
  "Bike handover photos",
  "Battery and charger photos",
  "Extra customer documents",
];

const liabilityTerms = [
  "I, the above-mentioned renter, agree to hire from BEYOND BIKES PTY LTD the vehicle/e-bike and accessories for the price payable in the manner and on the terms and conditions contained in this agreement.",
  "The renter agrees to waive all claims and/or causes of action against BEYOND BIKES PTY LTD arising from the operation, use, or misuse of the rented bicycle.",
  "The renter is responsible for all rental fees and any damages to the bicycle or equipment, and must return the bike in the same condition as received, normal wear and tear excluded.",
  "Theft, total loss, or irreparable damage of the rental bike or its components is the full responsibility of the renter.",
  "All damage/loss charges are separate from the security bond and weekly rental fees.",
];

const highlightedTerms = [
  "For rental, we do not provide on-spot service for breakdown e-bike. The rider has to bring the e-bike to the workshop by themselves. Towing service available, terms and conditions apply.",
  "For late payment, penalty is $20 per day.",
  "Minimum 2 weeks rent.",
  "A minimum 7 days notice is required before returning the bike.",
  "Bond will be returned if the e-bike is in good condition and clean. Bond refund is within 3-5 working days and complies with bank business hours.",
  "Rent must be paid before 2:00 PM on the due date.",
];

const roadLegalWarnings = [
  "THE ELECTRIC BIKE ROAD LEGAL SPEED IS NOT MORE THAN 25KMS/H ON PEDAL ASSIST MODE.",
  "SPEED UNLOCK/THROTTLE ACTIVATION WILL BE ONLY FOR NONE-PUBLIC ROAD APPLICATION.",
  "WE STRONGLY RECOMMEND CUSTOMERS TO MAKE DECISION BASED ON THE OBSERVANCE OF REGULATION.",
  "IF YOU GET PENALTY IT IS UNDER YOUR RESPONSIBILITY, NOT UNDER OUR COMPANY. PLEASE RIDE FOLLOWING THE AUSTRALIAN RULES.",
  "Reference: https://www.vicroads.vic.gov.au/safety-and-road-rules/cyclist-safety/power-assisted-bicycles",
];

function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(settingsStoreName)) {
        db.createObjectStore(settingsStoreName, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putSetting<T>(key: string, value: T) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(settingsStoreName, "readwrite");
    tx.objectStore(settingsStoreName).put({ key, value });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function getSetting<T>(key: string): Promise<T | null> {
  const db = await openDb();
  const row = await new Promise<{ key: string; value: T } | undefined>((resolve, reject) => {
    const tx = db.transaction(settingsStoreName, "readonly");
    const request = tx.objectStore(settingsStoreName).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return row?.value ?? null;
}

async function putRecord(record: StoredContract & { pdf: Blob }) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function getRecords(): Promise<StoredContract[]> {
  const db = await openDb();
  const rows = await new Promise<(StoredContract & { pdf: Blob })[]>((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return rows
    .map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      renterName: row.renterName,
      email: row.email,
      phone: row.phone,
      rentalStart: row.rentalStart,
      rentalEnd: row.rentalEnd,
      attachmentCount: row.attachmentCount,
      pdfSize: row.pdfSize,
      form: row.form,
      attachmentNames: row.attachmentNames,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function getRecord(id: string): Promise<(StoredContract & { pdf: Blob }) | null> {
  const db = await openDb();
  const row = await new Promise<(StoredContract & { pdf: Blob }) | undefined>((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return row ?? null;
}

async function getPdf(id: string): Promise<Blob | null> {
  const row = await getRecord(id);
  return row?.pdf ?? null;
}

async function deleteRecord(id: string) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function fieldValue(value: string, fallback = "-") {
  return value.trim() || fallback;
}

function batteryLabel(form: ContractForm) {
  return form.battery === "Custom" ? fieldValue(form.customBattery, "Custom") : form.battery;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let lineText = "";
  for (const word of words) {
    const test = lineText ? `${lineText} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) <= maxWidth) {
      lineText = test;
    } else {
      if (lineText) lines.push(lineText);
      lineText = word;
    }
  }
  if (lineText) lines.push(lineText);
  return lines;
}

function drawTextBlock(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  font: PDFFont,
  size: number,
  options: { color?: ReturnType<typeof rgb>; leading?: number } = {},
) {
  const leading = options.leading ?? size + 4;
  const lines = wrapText(text, font, size, maxWidth);
  lines.forEach((lineText, index) => {
    page.drawText(lineText, {
      x,
      y: y - index * leading,
      size,
      font,
      color: options.color ?? ink,
    });
  });
  return y - lines.length * leading;
}

function drawHighlightedText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  font: PDFFont,
  size: number,
  options: { fill?: ReturnType<typeof rgb>; color?: ReturnType<typeof rgb>; leading?: number; padding?: number } = {},
) {
  const leading = options.leading ?? size + 5;
  const padding = options.padding ?? 4;
  const lines = wrapText(text, font, size, maxWidth - padding * 2);
  const height = lines.length * leading + padding * 2 - 2;
  page.drawRectangle({
    x,
    y: y - height + size + padding,
    width: maxWidth,
    height,
    color: options.fill ?? highlightFill,
  });
  lines.forEach((lineText, index) => {
    page.drawText(lineText, {
      x: x + padding,
      y: y - index * leading,
      size,
      font,
      color: options.color ?? warningRed,
    });
  });
  return y - lines.length * leading - padding;
}

function drawHeader(page: PDFPage, fonts: Fonts) {
  const { width, height } = page.getSize();
  page.drawText("BEYOND BIKES", { x: 46, y: height - 61, size: 16, font: fonts.bold, color: green });
  page.drawText("Freedom To Explore, Power To Move", { x: 46, y: height - 77, size: 7, font: fonts.bold, color: ink });
  page.drawLine({ start: { x: 178, y: height - 30 }, end: { x: 178, y: height - 96 }, thickness: 1, color: green });
  page.drawText("BEYOND BIKES PTY LTD", { x: 200, y: height - 58, size: 23, font: fonts.bold, color: green });
  page.drawText("BIKE RENTAL AGREEMENT FORM", { x: 200, y: height - 82, size: 15, font: fonts.regular, color: green });
  page.drawLine({ start: { x: 36, y: height - 112 }, end: { x: width - 36, y: height - 112 }, thickness: 1, color: green });
}

function drawFooter(page: PDFPage, fonts: Fonts) {
  page.drawLine({ start: { x: 36, y: 52 }, end: { x: 559, y: 52 }, thickness: 1, color: green });
  page.drawText("BEYOND BIKES PTY LTD", { x: 54, y: 34, size: 9, font: fonts.bold, color: ink });
  page.drawText("ACN: 685 765 824", { x: 54, y: 21, size: 8, font: fonts.regular, color: ink });
  page.drawText("ABN: 61988672940", { x: 54, y: 10, size: 8, font: fonts.regular, color: ink });
  page.drawText(`ADDRESS : ${businessAddress}`, { x: 260, y: 34, size: 8, font: fonts.regular, color: ink });
  page.drawText("Email : info.beyondbikes@gmail.com", { x: 260, y: 21, size: 8, font: fonts.regular, color: ink });
  page.drawText("Mobile : +61 422 032 961", { x: 260, y: 10, size: 8, font: fonts.regular, color: ink });
}

function drawSectionTitle(page: PDFPage, title: string, y: number, fonts: Fonts) {
  page.drawCircle({ x: 42, y: y + 5, size: 6, color: green });
  page.drawCircle({ x: 38, y: y + 8, size: 4, color: rgb(0.95, 0.98, 0.96) });
  page.drawText(title, { x: 58, y, size: 14, font: fonts.bold, color: ink });
}

function drawBox(page: PDFPage, x: number, y: number, w: number, h: number, text: string, fonts: Fonts, opts: { bold?: boolean; multiline?: boolean } = {}) {
  page.drawRectangle({ x, y, width: w, height: h, borderWidth: 0.7, borderColor: line, color: rgb(0.99, 1, 0.99) });
  if (text) {
    if (opts.multiline) {
      drawTextBlock(page, text, x + 7, y + h - 14, w - 14, opts.bold ? fonts.bold : fonts.regular, 8.5);
    } else {
      const display = text.length > 62 ? `${text.slice(0, 59)}...` : text;
      page.drawText(display, { x: x + 7, y: y + h / 2 - 3.5, size: 8.5, font: opts.bold ? fonts.bold : fonts.regular, color: ink });
    }
  }
}

function drawField(page: PDFPage, label: string, value: string, x: number, y: number, w: number, h: number, fonts: Fonts, opts: { multiline?: boolean; bold?: boolean } = {}) {
  page.drawText(label, { x, y: y + h + 6, size: 7.5, font: fonts.bold, color: muted });
  drawBox(page, x, y, w, h, value, fonts, opts);
}

function drawCheck(page: PDFPage, x: number, y: number, label: string, checked: boolean, fonts: Fonts) {
  page.drawRectangle({ x, y, width: 11, height: 11, borderWidth: 0.8, borderColor: line });
  if (checked) {
    page.drawLine({ start: { x: x + 2, y: y + 5 }, end: { x: x + 5, y: y + 2 }, thickness: 1.4, color: green });
    page.drawLine({ start: { x: x + 5, y: y + 2 }, end: { x: x + 10, y: y + 10 }, thickness: 1.4, color: green });
  }
  page.drawText(label, { x: x + 18, y: y + 1, size: 10, font: fonts.regular, color: ink });
}

async function addImagePage(pdfDoc: PDFDocument, file: File, bytes: ArrayBuffer, fonts: Fonts) {
  const page = pdfDoc.addPage([595, 842]);
  drawHeader(page, fonts);
  page.drawText(file.name, { x: 42, y: 700, size: 14, font: fonts.bold, color: ink });
  page.drawText(`${file.type || "image"} - ${formatBytes(file.size)}`, { x: 42, y: 682, size: 9, font: fonts.regular, color: muted });
  const image = file.type.includes("png") ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);
  const maxW = 510;
  const maxH = 560;
  const scale = Math.min(maxW / image.width, maxH / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  page.drawImage(image, { x: (595 - w) / 2, y: 92 + (maxH - h) / 2, width: w, height: h });
  drawFooter(page, fonts);
}

async function addGenericAttachmentPage(pdfDoc: PDFDocument, file: File, bytes: ArrayBuffer, fonts: Fonts) {
  await pdfDoc.attach(bytes, file.name, {
    mimeType: file.type || "application/octet-stream",
    description: "Supporting document uploaded with the Beyond Bikes contract",
    creationDate: new Date(),
    modificationDate: new Date(),
  });
  const page = pdfDoc.addPage([595, 842]);
  drawHeader(page, fonts);
  page.drawRectangle({ x: 58, y: 300, width: 479, height: 180, color: lightGreen, borderColor: green, borderWidth: 1 });
  page.drawText("Attached file", { x: 86, y: 430, size: 22, font: fonts.bold, color: green });
  page.drawText(file.name, { x: 86, y: 400, size: 13, font: fonts.bold, color: ink });
  page.drawText(`${file.type || "Unknown type"} - ${formatBytes(file.size)}`, { x: 86, y: 378, size: 10, font: fonts.regular, color: muted });
  drawTextBlock(
    page,
    "This document is embedded in the PDF as an attachment. Open the attachments panel in your PDF reader to view the original file.",
    86,
    348,
    390,
    fonts.regular,
    10,
    { color: ink, leading: 14 },
  );
  drawFooter(page, fonts);
}

async function buildContractPdf(form: ContractForm, attachments: AttachmentFile[]) {
  const pdfDoc = await PDFDocument.create();
  const regular = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const bold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fonts = { regular: helvetica, bold: helveticaBold };
  const page1 = pdfDoc.addPage([595, 842]);
  drawHeader(page1, fonts);
  drawSectionTitle(page1, "Renter & Rental Details", 655, fonts);
  drawField(page1, "LESSOR", "BEYOND BIKES", 58, 598, 230, 24, fonts, { bold: true });
  drawField(page1, "RENTER NAME", fieldValue(form.renterName), 306, 598, 230, 24, fonts);
  drawField(page1, "PHONE", fieldValue(form.phone), 58, 556, 148, 24, fonts);
  drawField(page1, "EMAIL", fieldValue(form.email), 224, 556, 312, 24, fonts);
  drawField(page1, "ADDRESS", fieldValue(form.address), 58, 514, 478, 28, fonts);
  drawField(page1, "RENTAL START DATE", fieldValue(form.rentalStart), 58, 470, 230, 24, fonts);
  drawField(page1, "RENTAL END DATE", fieldValue(form.rentalEnd), 306, 470, 230, 24, fonts);

  drawSectionTitle(page1, "Bike & Battery Details", 430, fonts);
  drawField(page1, "BIKE MAKE & MODEL", fieldValue(form.bikeMakeModel), 58, 382, 478, 24, fonts);
  drawField(page1, "BIKE FRAME NUMBER", fieldValue(form.bikeFrameNumber), 58, 342, 230, 24, fonts);
  drawField(page1, "BB FLEET NUMBER", fieldValue(form.fleetNumber), 306, 342, 230, 24, fonts);
  drawField(page1, "BATTERY SERIAL NUMBER", fieldValue(form.batterySerialNumber), 58, 302, 230, 24, fonts);
  drawField(page1, "BATTERY NUMBER", fieldValue(form.batteryNumber), 306, 302, 230, 24, fonts);
  drawField(page1, "KM START", fieldValue(form.kmStart), 58, 262, 230, 24, fonts);
  drawField(page1, "KM END", fieldValue(form.kmEnd), 306, 262, 230, 24, fonts);
  page1.drawText("BATTERY TYPE", { x: 58, y: 238, size: 7.5, font: fonts.bold, color: muted });
  drawCheck(page1, 58, 216, "48V 60A", form.battery === "48V 60A", fonts);
  drawCheck(page1, 190, 216, "48V 70A", form.battery === "48V 70A", fonts);
  drawCheck(page1, 322, 216, "48V 80A", form.battery === "48V 80A", fonts);
  drawField(page1, "CUSTOM / SELECTED", batteryLabel(form), 420, 208, 116, 24, fonts);

  drawSectionTitle(page1, "Rental Conditions", 178, fonts);
  drawField(page1, "MINIMUM RENTAL TERM", "Two (2) weeks", 58, 132, 180, 24, fonts, { bold: true });
  drawField(page1, "PRE-TRIP BIKE CONDITION", fieldValue(form.preTripCondition, ""), 258, 104, 278, 52, fonts, { multiline: true });
  drawField(page1, "BIKE CONDITION ON RETURN", fieldValue(form.returnCondition, ""), 58, 62, 478, 24, fonts);
  drawFooter(page1, fonts);

  const page2 = pdfDoc.addPage([595, 842]);
  drawHeader(page2, fonts);
  drawSectionTitle(page2, "Accessories Provided", 686, fonts);
  drawCheck(page2, 78, 650, "Helmet", form.helmet, fonts);
  drawCheck(page2, 78, 628, "Bike Lock", form.bikeLock, fonts);
  drawCheck(page2, 230, 650, "Delivery Bag", form.deliveryBag, fonts);
  drawCheck(page2, 230, 628, "Battery Lock & Charger", form.batteryLockCharger, fonts);
  drawCheck(page2, 410, 650, "GPS Tracker", form.gpsTracker, fonts);
  if (form.customAccessories.length > 0) {
    drawBox(page2, 78, 592, 460, 28, `Extra: ${form.customAccessories.join(", ")}`, fonts, { multiline: true });
  }

  drawSectionTitle(page2, "Rental Terms, Costs & Liability", 594, fonts);
  let y = 566;
  liabilityTerms.forEach((term, index) => {
    page2.drawText(`${index + 1}.`, { x: 56, y, size: 9, font: bold, color: ink });
    y = drawTextBlock(page2, term, 80, y, 458, regular, 9, { leading: 12 }) - 5;
  });
  y = drawHighlightedText(page2, highlightedTerms[0], 56, y - 3, 482, bold, 8.5, {
    fill: warningFill,
    color: warningRed,
    leading: 12,
  });

  page2.drawText("Lost/Stolen Charges", { x: 56, y: y - 6, size: 13, font: bold, color: ink });
  y -= 34;
  drawBox(page2, 56, y, 150, 24, "Bike frame: $1000", fonts, { bold: true });
  drawBox(page2, 222, y, 170, 24, "Battery: $900 / $1100 / $1300", fonts, { bold: true });
  drawBox(page2, 408, y, 130, 24, "GPS: $50", fonts, { bold: true });
  y -= 34;
  drawBox(page2, 56, y - 18, 482, 42, "Accessories: Helmet $45, Bike lock $45, Charger $80, Delivery bag $40, Winter gloves $30", fonts, {
    bold: true,
    multiline: true,
  });
  y -= 72;

  page2.drawText("Bond/Rent", { x: 56, y, size: 13, font: bold, color: ink });
  y -= 34;
  drawBox(page2, 56, y, 155, 24, `Bond: ${fieldValue(form.bond, "$")}`, fonts);
  drawBox(page2, 224, y, 155, 24, `Rental fee: ${fieldValue(form.weeklyFee, "$")}`, fonts);
  drawBox(page2, 392, y, 146, 24, `Next due: ${fieldValue(form.rentalEnd)}`, fonts);

  let highlightY = y - 34;
  highlightedTerms.slice(1).forEach((term) => {
    highlightY = drawHighlightedText(page2, term, 56, highlightY, 482, bold, 8.5, {
      fill: highlightFill,
      color: warningRed,
      leading: 12,
      padding: 3,
    });
  });
  drawFooter(page2, fonts);

  const page3 = pdfDoc.addPage([595, 842]);
  drawHeader(page3, fonts);
  drawSectionTitle(page3, "Road Legal & Off-road Declaration", 686, fonts);
  let roadY = 650;
  roadY = drawTextBlock(
    page3,
    "The renter will be taken to have read, understood and accepted this agreement if the renter signs this contract, orders, accepts or pays for any e-bike provided by BEYOND BIKES, continues to instruct BEYOND BIKES, or continues to use the e-bike after receiving or becoming aware of this agreement.",
    56,
    roadY,
    482,
    bold,
    10,
    { leading: 14 },
  );
  roadY -= 14;
  roadLegalWarnings.forEach((warning) => {
    roadY = drawHighlightedText(page3, warning, 56, roadY, 482, bold, 9, {
      fill: warningFill,
      color: warningRed,
      leading: 12,
      padding: 3,
    });
  });

  const declarationTitleY = Math.max(380, roadY - 42);
  page3.drawText("Off-road High Power Controller Upgrade Declaration", { x: 56, y: declarationTitleY, size: 15, font: bold, color: ink });
  page3.drawLine({ start: { x: 56, y: declarationTitleY - 4 }, end: { x: 538, y: declarationTitleY - 4 }, thickness: 1, color: ink });
  let declarationY = declarationTitleY - 32;
  [
    "Customer agreed to unlock the e-bike power to unlimited output. Customer acknowledges that the high-power e-bike setup, more than 250W PAS and 200W throttle, may create faster speed and higher motor output.",
    "The bike is not road legal anymore on public roads when used in this high-power setup. The e-bike must be used on private property or for off-road purpose only.",
    "BEYOND BIKES is not responsible for any cause from the uncapped power and speed. The customer acknowledges and understands that the rider is responsible for their behaviour while riding the bike.",
  ].forEach((paragraph) => {
    declarationY = drawTextBlock(page3, paragraph, 56, declarationY, 482, bold, 11, { leading: 15 }) - 8;
  });

  page3.drawText("By signing below, the renter acknowledges they have read, understood, and agreed to all terms and conditions.", {
    x: 56,
    y: 164,
    size: 10,
    font: bold,
    color: ink,
  });
  page3.drawText("Signature of Renter:", { x: 56, y: 130, size: 10, font: regular, color: ink });
  page3.drawLine({ start: { x: 172, y: 127 }, end: { x: 365, y: 127 }, thickness: 0.8, color: line });
  if (form.renterSignature) {
    const signatureBytes = await fetch(form.renterSignature).then((response) => response.arrayBuffer());
    const signature = await pdfDoc.embedPng(signatureBytes);
    page3.drawImage(signature, { x: 180, y: 128, width: 150, height: 42 });
  }
  page3.drawText("Print Name:", { x: 56, y: 104, size: 10, font: regular, color: ink });
  page3.drawText(fieldValue(form.renterName), { x: 126, y: 104, size: 10, font: helvetica, color: ink });
  page3.drawLine({ start: { x: 126, y: 100 }, end: { x: 365, y: 100 }, thickness: 0.8, color: line });
  page3.drawText("Date:", { x: 56, y: 80, size: 10, font: regular, color: ink });
  page3.drawText(today(), { x: 96, y: 80, size: 10, font: helvetica, color: ink });
  page3.drawLine({ start: { x: 96, y: 76 }, end: { x: 365, y: 76 }, thickness: 0.8, color: line });
  drawFooter(page3, fonts);

  if (attachments.length) {
    const cover = pdfDoc.addPage([595, 842]);
    drawHeader(cover, fonts);
    cover.drawText("Supporting Documents", { x: 56, y: 672, size: 22, font: helveticaBold, color: green });
    cover.drawText("The following customer files were included with this contract.", { x: 56, y: 646, size: 11, font: helvetica, color: ink });
    let rowY = 602;
    attachments.forEach((attachment, index) => {
      cover.drawText(`${index + 1}.`, { x: 64, y: rowY, size: 10, font: helveticaBold, color: ink });
      cover.drawText(attachment.file.name, { x: 90, y: rowY, size: 10, font: helvetica, color: ink });
      cover.drawText(`${attachment.file.type || "file"} - ${formatBytes(attachment.file.size)}`, { x: 90, y: rowY - 15, size: 8, font: helvetica, color: muted });
      rowY -= 42;
    });
    drawFooter(cover, fonts);
  }

  for (const attachment of attachments) {
    const bytes = await attachment.file.arrayBuffer();
    if (attachment.file.type === "application/pdf") {
      const attachedPdf = await PDFDocument.load(bytes);
      const pages = await pdfDoc.copyPages(attachedPdf, attachedPdf.getPageIndices());
      pages.forEach((page) => pdfDoc.addPage(page));
      await pdfDoc.attach(bytes, attachment.file.name, {
        mimeType: "application/pdf",
        description: "Original PDF uploaded with the Beyond Bikes contract",
        creationDate: new Date(),
        modificationDate: new Date(),
      });
    } else if (attachment.file.type.includes("png") || attachment.file.type.includes("jpeg") || attachment.file.type.includes("jpg")) {
      await addImagePage(pdfDoc, attachment.file, bytes, fonts);
    } else {
      await addGenericAttachmentPage(pdfDoc, attachment.file, bytes, fonts);
    }
  }

  return pdfDoc.save();
}

function SignaturePad({
  value,
  onChange,
}: {
  value: string;
  onChange: (signature: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!value) return;
    const image = new Image();
    image.onload = () => ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.src = value;
  }, [value]);

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function start(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawing.current = true;
    canvas.setPointerCapture(event.pointerId);
    const p = point(event);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const canvas = event.currentTarget;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const p = point(event);
    ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = "#101820";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  function end(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = event.currentTarget;
    canvas.releasePointerCapture(event.pointerId);
    onChange(canvas.toDataURL("image/png"));
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    onChange("");
  }

  return (
    <div className="signature-panel">
      <canvas
        ref={canvasRef}
        width={720}
        height={220}
        className="signature-canvas"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        aria-label="Customer signature pad"
      />
      <button type="button" className="icon-button" onClick={clear} aria-label="Clear signature" title="Clear signature">
        <Eraser size={18} />
      </button>
    </div>
  );
}

function TextInput({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} type={type} placeholder={placeholder} />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="field field-wide">
      <span>{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export default function Home() {
  const [form, setForm] = useState<ContractForm>(emptyForm);
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
  const [records, setRecords] = useState<StoredContract[]>([]);
  const [activeView, setActiveView] = useState<AppView>("contract");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRecord, setSelectedRecord] = useState<StoredContract | null>(null);
  const [recordToDelete, setRecordToDelete] = useState<StoredContract | null>(null);
  const [newAccessory, setNewAccessory] = useState("");
  const [saveFolder, setSaveFolder] = useState<FileSystemDirectoryHandle | null>(null);
  const [storagePersistent, setStoragePersistent] = useState<boolean | null>(null);

  const completion = useMemo(() => {
    const required: (keyof ContractForm)[] = ["renterName", "phone", "email", "address", "rentalStart", "rentalEnd", "bikeMakeModel", "bikeFrameNumber"];
    const done = required.filter((key) => String(form[key]).trim()).length;
    return Math.round((done / required.length) * 100);
  }, [form]);

  const filteredRecords = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return records;
    return records.filter((record) =>
      [record.renterName, record.email, record.phone, record.rentalStart, record.rentalEnd, ...(record.attachmentNames ?? [])]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [records, searchQuery]);

  useEffect(() => {
    const raw = localStorage.getItem(localDraftKey);
    if (raw) {
      try {
        window.setTimeout(() => setForm({ ...emptyForm, ...JSON.parse(raw) }), 0);
      } catch {
        localStorage.removeItem(localDraftKey);
      }
    }
    getRecords().then(setRecords).catch(() => setStatus("Could not read saved local contracts."));
    navigator.storage?.persisted?.().then(setStoragePersistent).catch(() => setStoragePersistent(null));
    getSetting<FileSystemDirectoryHandle>(saveFolderKey)
      .then((handle) => {
        if (handle) {
          setSaveFolder(handle);
          setStatus(`Save folder restored: ${handle.name}. Chrome may ask permission again when saving.`);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    localStorage.setItem(localDraftKey, JSON.stringify(form));
  }, [form]);

  function update<K extends keyof ContractForm>(key: K, value: ContractForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function addFiles(files: FileList | null) {
    if (!files) return;
    const next = Array.from(files).map((file) => ({ id: createId(), file }));
    setAttachments((current) => [...current, ...next]);
  }

  function addAccessory() {
    const value = newAccessory.trim();
    if (!value) return;
    setForm((current) => ({ ...current, customAccessories: [...current.customAccessories, value] }));
    setNewAccessory("");
  }

  function removeAccessory(accessory: string) {
    setForm((current) => ({ ...current, customAccessories: current.customAccessories.filter((item) => item !== accessory) }));
  }

  async function chooseSaveFolder() {
    const browser = window as BrowserWithStorageTools;
    if (!browser.showDirectoryPicker) {
      setStatus("This browser does not support choosing a save folder. Chrome/Edge on desktop usually supports it.");
      return;
    }
    try {
      const handle = await browser.showDirectoryPicker();
      setSaveFolder(handle);
      await putSetting(saveFolderKey, handle);
      setStatus(`PDFs will also save to the selected folder: ${handle.name}.`);
    } catch {
      setStatus("Folder selection was cancelled.");
    }
  }

  async function saveBlobToFolder(blob: Blob, filename: string) {
    if (!saveFolder) return false;
    const permission = await saveFolder.queryPermission?.({ mode: "readwrite" });
    if (permission !== "granted") {
      const requested = await saveFolder.requestPermission?.({ mode: "readwrite" });
      if (requested !== "granted") return false;
    }
    const file = await saveFolder.getFileHandle(filename, { create: true });
    const writable = await file.createWritable();
    await writable.write(blob);
    await writable.close();
    return true;
  }

  async function requestPersistentStorage() {
    if (!navigator.storage?.persist) {
      setStatus("This browser does not support persistent storage requests.");
      return;
    }
    const granted = await navigator.storage.persist();
    setStoragePersistent(granted);
    setStatus(
      granted
        ? "Browser storage is marked persistent. Chrome should avoid clearing it automatically, but manual clearing can still remove it."
        : "The browser did not grant persistent storage. Download PDFs or choose a save folder for important contracts.",
    );
  }

  async function generatePdf(options: { saveRecord?: boolean; download?: boolean } = { saveRecord: true, download: true }) {
    setBusy(true);
    setStatus("Creating PDF locally in this browser...");
    try {
      const pdfBytes = await buildContractPdf(form, attachments);
      const pdfBuffer = new ArrayBuffer(pdfBytes.byteLength);
      new Uint8Array(pdfBuffer).set(pdfBytes);
      const blob = new Blob([pdfBuffer], { type: "application/pdf" });
      const filename = `Beyond-Bikes-${fieldValue(form.renterName, "contract").replace(/[^a-z0-9]+/gi, "-")}-${today()}.pdf`;
      if (options.download) downloadBlob(blob, filename);
      const savedToFolder = await saveBlobToFolder(blob, filename).catch(() => false);
      if (options.saveRecord) {
        const record = {
          id: createId(),
          createdAt: new Date().toISOString(),
          renterName: fieldValue(form.renterName),
          email: form.email,
          phone: form.phone,
          rentalStart: form.rentalStart,
          rentalEnd: form.rentalEnd,
          attachmentCount: attachments.length,
          attachmentNames: attachments.map((attachment) => attachment.file.name),
          pdfSize: blob.size,
          form: { ...form, customAccessories: [...form.customAccessories] },
          pdf: blob,
        };
        await putRecord(record);
        setRecords(await getRecords());
      }
      setStatus(savedToFolder ? "PDF created, saved in browser records, downloaded, and written to the selected folder." : "PDF created, downloaded, and saved in browser records.");
      return blob;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not create PDF.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function sendToCustomer() {
    const blob = await generatePdf({ saveRecord: true, download: true });
    if (!blob) return;
    const subject = encodeURIComponent("Beyond Bikes rental agreement");
    const body = encodeURIComponent(
      `Hi ${fieldValue(form.renterName, "there")},\n\nPlease find your Beyond Bikes rental agreement attached. The PDF has been downloaded on this computer, so attach it to this email before sending.\n\nRegards,\nBeyond Bikes`,
    );
    window.location.href = `mailto:${form.email}?subject=${subject}&body=${body}`;
  }

  async function downloadSaved(record: StoredContract) {
    const pdf = await getPdf(record.id);
    if (pdf) downloadBlob(pdf, `Beyond-Bikes-${record.renterName.replace(/[^a-z0-9]+/gi, "-")}.pdf`);
  }

  async function loadRecord(record: StoredContract) {
    const fullRecord = await getRecord(record.id);
    if (!fullRecord?.form) {
      setStatus("This older saved PDF does not have editable contract fields saved. You can still download it.");
      return;
    }
    setForm({ ...emptyForm, ...fullRecord.form, customAccessories: fullRecord.form.customAccessories ?? [] });
    setAttachments([]);
    setSelectedRecord(null);
    setActiveView("contract");
    setStatus("Contract fields loaded. Please re-add customer documents before generating a new PDF.");
  }

  async function removeRecord(record: StoredContract) {
    await deleteRecord(record.id);
    setRecords(await getRecords());
    setSelectedRecord(null);
    setRecordToDelete(null);
  }

  return (
    <main className="app-shell">
      <section className="topbar">
        <div className="brand-mark">
          <Bike size={34} />
          <div>
            <strong>BEYOND BIKES</strong>
            <span>Contract desk</span>
          </div>
        </div>
        <div className="privacy-pill">
          <ShieldCheck size={16} />
          Local-only customer data
        </div>
      </section>

      <nav className="app-menu" aria-label="Main menu">
        <button type="button" className={activeView === "contract" ? "menu-tab active" : "menu-tab"} onClick={() => setActiveView("contract")}>
          <FileText size={17} />
          Contract
        </button>
        <button type="button" className={activeView === "dashboard" ? "menu-tab active" : "menu-tab"} onClick={() => setActiveView("dashboard")}>
          <Menu size={17} />
          Dashboard
        </button>
      </nav>

      <section className="hero-band">
        <div>
          <p>Bike Rental Agreement Form</p>
          <h1>Create signed rental contracts with customer documents attached.</h1>
        </div>
        <div className="progress-block">
          <span>{completion}%</span>
          <div className="progress-track">
            <div style={{ width: `${completion}%` }} />
          </div>
        </div>
      </section>

      <div className="workspace">
        <aside className="side-panel">
          <button type="button" className="primary-button" onClick={() => generatePdf()} disabled={busy}>
            <Download size={18} />
            Generate PDF
          </button>
          <button type="button" className="secondary-button" onClick={sendToCustomer} disabled={busy}>
            <Mail size={18} />
            Send to customer
          </button>
          <button type="button" className="secondary-button" onClick={chooseSaveFolder}>
            <HardDrive size={18} />
            Choose save folder
          </button>
          <button type="button" className="secondary-button" onClick={() => setForm({ ...emptyForm, rentalStart: today() })}>
            <Plus size={18} />
            New contract
          </button>
          <button type="button" className="secondary-button" onClick={requestPersistentStorage}>
            <ShieldCheck size={18} />
            Protect browser data
          </button>
          <div className="status-box">
            <Save size={17} />
            <p>
              {status ||
                `Draft saves automatically. PDFs stay in browser records${saveFolder ? ` and selected folder "${saveFolder.name}"` : ""}. Storage: ${
                  storagePersistent === null ? "unknown" : storagePersistent ? "persistent" : "standard"
                }.`}
            </p>
          </div>
          <div className="doc-list">
            <h2>Needed files</h2>
            {requiredDocs.map((doc) => (
              <div key={doc} className="doc-row">
                <Check size={15} />
                <span>{doc}</span>
              </div>
            ))}
          </div>
        </aside>

        {activeView === "contract" ? (
        <section className="form-stack">
          <div className="panel">
            <div className="panel-heading">
              <CalendarDays size={20} />
              <h2>Renter & rental details</h2>
            </div>
            <div className="field-grid">
              <TextInput label="Renter name" value={form.renterName} onChange={(value) => update("renterName", value)} />
              <TextInput label="Phone" value={form.phone} onChange={(value) => update("phone", value)} />
              <TextInput label="Email" value={form.email} onChange={(value) => update("email", value)} type="email" />
              <TextInput label="Rental start date" value={form.rentalStart} onChange={(value) => update("rentalStart", value)} type="date" />
              <TextInput label="Rental end date" value={form.rentalEnd} onChange={(value) => update("rentalEnd", value)} type="date" />
              <TextInput label="Weekly fee" value={form.weeklyFee} onChange={(value) => update("weeklyFee", value)} placeholder="$" />
              <TextInput label="Bond" value={form.bond} onChange={(value) => update("bond", value)} placeholder="$" />
              <TextArea label="Address" value={form.address} onChange={(value) => update("address", value)} />
            </div>
          </div>

          <div className="panel">
            <div className="panel-heading">
              <Bike size={20} />
              <h2>Bike & battery details</h2>
            </div>
            <div className="field-grid">
              <TextInput label="Bike make & model" value={form.bikeMakeModel} onChange={(value) => update("bikeMakeModel", value)} />
              <TextInput label="Bike frame number" value={form.bikeFrameNumber} onChange={(value) => update("bikeFrameNumber", value)} />
              <TextInput label="Battery serial number" value={form.batterySerialNumber} onChange={(value) => update("batterySerialNumber", value)} />
              <TextInput label="Battery number" value={form.batteryNumber} onChange={(value) => update("batteryNumber", value)} />
              <TextInput label="Km start" value={form.kmStart} onChange={(value) => update("kmStart", value)} />
              <TextInput label="Km end" value={form.kmEnd} onChange={(value) => update("kmEnd", value)} />
              <TextInput label="BB fleet number" value={form.fleetNumber} onChange={(value) => update("fleetNumber", value)} />
              <label className="field">
                <span>Battery</span>
                <select value={form.battery} onChange={(event) => update("battery", event.target.value as BatterySize)}>
                  <option>48V 60A</option>
                  <option>48V 70A</option>
                  <option>48V 80A</option>
                  <option>Custom</option>
                </select>
              </label>
              {form.battery === "Custom" ? (
                <TextInput label="Custom battery" value={form.customBattery} onChange={(value) => update("customBattery", value)} placeholder="Example: 52V 30Ah" />
              ) : null}
              <TextArea label="Pre-trip bike condition" value={form.preTripCondition} onChange={(value) => update("preTripCondition", value)} />
              <TextArea label="Bike condition on return" value={form.returnCondition} onChange={(value) => update("returnCondition", value)} />
            </div>
          </div>

          <div className="panel">
            <div className="panel-heading">
              <FileArchive size={20} />
              <h2>Accessories & customer documents</h2>
            </div>
            <div className="toggle-grid">
              <Toggle label="Helmet" checked={form.helmet} onChange={(value) => update("helmet", value)} />
              <Toggle label="Bike lock" checked={form.bikeLock} onChange={(value) => update("bikeLock", value)} />
              <Toggle label="Delivery bag" checked={form.deliveryBag} onChange={(value) => update("deliveryBag", value)} />
              <Toggle label="Battery lock & charger" checked={form.batteryLockCharger} onChange={(value) => update("batteryLockCharger", value)} />
              <Toggle label="GPS tracker" checked={form.gpsTracker} onChange={(value) => update("gpsTracker", value)} />
            </div>

            <div className="inline-add">
              <TextInput label="Add accessory" value={newAccessory} onChange={setNewAccessory} placeholder="Example: phone holder" />
              <button type="button" className="secondary-button" onClick={addAccessory}>
                <Plus size={18} />
                Add
              </button>
            </div>

            {form.customAccessories.length > 0 ? (
              <div className="chip-list">
                {form.customAccessories.map((accessory) => (
                  <button type="button" className="chip" key={accessory} onClick={() => removeAccessory(accessory)} title="Remove accessory">
                    {accessory}
                    <X size={14} />
                  </button>
                ))}
              </div>
            ) : null}

            <label className="upload-zone">
              <Upload size={28} />
              <span>Add visa, ID, bike photos, PDFs, and other documents</span>
              <input type="file" multiple accept="image/*,.pdf,.doc,.docx,.heic,.heif" onChange={(event) => addFiles(event.target.files)} />
            </label>

            <div className="attachment-list">
              {attachments.map((attachment) => (
                <div className="attachment-row" key={attachment.id}>
                  <FileText size={18} />
                  <div>
                    <strong>{attachment.file.name}</strong>
                    <span>
                      {attachment.file.type || "file"} - {formatBytes(attachment.file.size)}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => setAttachments((current) => current.filter((item) => item.id !== attachment.id))}
                    aria-label={`Remove ${attachment.file.name}`}
                    title="Remove file"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-heading">
              <PenLine size={20} />
              <h2>Customer signature</h2>
            </div>
            <SignaturePad value={form.renterSignature} onChange={(value) => update("renterSignature", value)} />
          </div>

          <div className="panel">
            <div className="panel-heading">
              <FolderOpen size={20} />
              <h2>Saved local contracts</h2>
            </div>
            <div className="records-list">
              {records.length === 0 ? (
                <p className="empty-state">No generated PDFs saved on this computer yet.</p>
              ) : (
                records.map((record) => (
                  <div className="record-row" key={record.id}>
                    <div>
                      <strong>{record.renterName}</strong>
                      <span>
                        {new Date(record.createdAt).toLocaleString()} - {record.attachmentCount} files - {formatBytes(record.pdfSize)}
                      </span>
                    </div>
                    <button type="button" className="icon-button" onClick={() => downloadSaved(record)} aria-label="Download saved PDF" title="Download saved PDF">
                      <Download size={17} />
                    </button>
                    <button type="button" className="icon-button danger" onClick={() => setRecordToDelete(record)} aria-label="Delete saved PDF" title="Delete saved PDF">
                      <Trash2 size={17} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
        ) : (
          <section className="form-stack">
            <div className="panel">
              <div className="panel-heading panel-heading-split">
                <div>
                  <FolderOpen size={20} />
                  <h2>Contract dashboard</h2>
                </div>
                <span>{records.length} saved</span>
              </div>
              <label className="search-box">
                <Search size={18} />
                <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search by name, phone, email, date, or file" />
              </label>
              <div className="records-list">
                {filteredRecords.length === 0 ? (
                  <p className="empty-state">No matching saved contracts.</p>
                ) : (
                  filteredRecords.map((record) => (
                    <div className="record-row" key={record.id}>
                      <div>
                        <strong>{record.renterName}</strong>
                        <span>
                          {new Date(record.createdAt).toLocaleString()} - {record.attachmentCount} files - {formatBytes(record.pdfSize)}
                        </span>
                      </div>
                      <button type="button" className="secondary-button compact" onClick={() => setSelectedRecord(record)}>
                        Open
                      </button>
                      <button type="button" className="icon-button" onClick={() => downloadSaved(record)} aria-label="Download saved PDF" title="Download saved PDF">
                        <Download size={17} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        )}
      </div>

      {selectedRecord ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="contract-actions-title">
          <div className="modal">
            <div className="modal-heading">
              <div>
                <h2 id="contract-actions-title">{selectedRecord.renterName}</h2>
                <p>{new Date(selectedRecord.createdAt).toLocaleString()}</p>
              </div>
              <button type="button" className="icon-button" onClick={() => setSelectedRecord(null)} aria-label="Close popup">
                <X size={18} />
              </button>
            </div>
            <div className="modal-details">
              <span>Email: {selectedRecord.email || "-"}</span>
              <span>Phone: {selectedRecord.phone || "-"}</span>
              <span>Rental: {selectedRecord.rentalStart || "-"} to {selectedRecord.rentalEnd || "-"}</span>
              <span>Files: {selectedRecord.attachmentNames?.join(", ") || `${selectedRecord.attachmentCount} saved in PDF`}</span>
            </div>
            <div className="modal-actions">
              <button type="button" className="primary-button" onClick={() => loadRecord(selectedRecord)}>
                Update contract
              </button>
              <button type="button" className="secondary-button" onClick={() => downloadSaved(selectedRecord)}>
                Download PDF
              </button>
              <button type="button" className="secondary-button danger-text" onClick={() => setRecordToDelete(selectedRecord)}>
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {recordToDelete ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="delete-contract-title">
          <div className="modal small-modal">
            <div className="modal-heading">
              <div>
                <h2 id="delete-contract-title">Delete contract?</h2>
                <p>{recordToDelete.renterName} - {new Date(recordToDelete.createdAt).toLocaleString()}</p>
              </div>
              <button type="button" className="icon-button" onClick={() => setRecordToDelete(null)} aria-label="Close delete confirmation">
                <X size={18} />
              </button>
            </div>
            <div className="modal-details">
              <span>This removes the saved browser record and PDF from this site. Downloaded files already on your computer are not removed.</span>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setRecordToDelete(null)}>
                Cancel
              </button>
              <button type="button" className="primary-button danger-button" onClick={() => removeRecord(recordToDelete)}>
                Delete contract
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
