import { MultiFormatReader, BarcodeFormat, DecodeHintType, RGBLuminanceSource, BinaryBitmap, HybridBinarizer } from '@zxing/library';

export function decodeBarcode(imageData: Uint8ClampedArray, width: number, height: number) {
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128]);
  const reader = new MultiFormatReader();
  reader.setHints(hints);

  // Zxing needs a LuminanceSource
  const source = new RGBLuminanceSource(imageData, width, height);
  const bitmap = new BinaryBitmap(new HybridBinarizer(source));
  
  try {
    const result = reader.decode(bitmap);
    console.log("Result:", result.getText());
    console.log("Points:", result.getResultPoints());
  } catch(e) {
    console.log("Not found");
  }
}
decodeBarcode(new Uint8ClampedArray(400), 10, 10);
