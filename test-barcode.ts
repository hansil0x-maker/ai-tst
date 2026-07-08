import JsBarcode from 'jsbarcode';
import { DOMImplementation, XMLSerializer } from '@xmldom/xmldom';
import { MultiFormatReader, BarcodeFormat, DecodeHintType, RGBLuminanceSource, BinaryBitmap, HybridBinarizer } from '@zxing/library';
import { Jimp } from 'jimp';

// Unfortunately JsBarcode canvas requires DOM, let's just generate via Exams.tsx in UI and then test with omr.ts.
