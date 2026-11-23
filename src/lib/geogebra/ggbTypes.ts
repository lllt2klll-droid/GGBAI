/**
 * Minimal typings cho GeoGebra Apps API (deployggb.js).
 * Chỉ khai báo các method adapter sử dụng; method không chắc chắn
 * được gọi defensive (optional) và trả null khi không hỗ trợ.
 * Tham chiếu: https://geogebra.github.io/docs/reference/en/GeoGebra_Apps_API/
 */

export interface GGBApi {
  evalCommand(cmd: string): boolean;
  evalCommandGetLabels?(cmd: string): string;
  getAllObjectNames?(): string[];
  isDefined?(name: string): boolean;
  getObjectType?(name: string): string;
  getValue?(name: string): string;
  getXcoord?(name: string): number;
  getYcoord?(name: string): number;
  setCoords?(name: string, x: number, y: number): void;
  setColor?(name: string, r: number, g: number, b: number): void;
  setVisible?(name: string, visible: boolean): void;
  setLabelVisible?(name: string, visible: boolean): void;
  renameObject?(oldName: string, newName: string): boolean;
  deleteObject?(name: string): void;
  getBase64?(): string;
  setBase64?(data: string): boolean;
  /** Xuất ảnh canvas — format: png/svg/jpg/jpeg/webp. Trả void, tự download. */
  exportImage?(
    filename: string,
    format: string,
    scale?: number,
    dpi?: number,
    transparent?: boolean,
    copyToClipboard?: boolean,
  ): void;
  registerAddListener?(fn: (name: string) => void): number;
  registerRemoveListener?(fn: (name: string) => void): number;
  registerObjectUpdateListener?(fn: (name: string) => void): number;
  unregisterListener?(id: number): void;
}

export interface GGBAppletParams {
  appName?: string;
  width?: number;
  height?: number;
  showToolBar?: boolean;
  showAlgebraInput?: boolean;
  showMenuBar?: boolean;
  appletOnLoad?: (api: GGBApi) => void;
  [key: string]: unknown;
}

export interface GGBAppletInstance {
  inject(elementId: string): void;
  getAPI?(): GGBApi;
}

declare global {
  interface Window {
    GGBApplet?: new (
      params: GGBAppletParams,
      preventIframe?: boolean,
    ) => GGBAppletInstance;
  }
}

export {};
