import leaflet from "leaflet";

interface Cell {
  readonly i: number;
  readonly j: number;
}

export class Board {
  readonly tileWidth: number;
  readonly tileVisibilityRadius: number;
  private readonly knownCells: Map<string, Cell>;

  constructor(tileWidth: number, tileVisibilityRadius: number) {
    this.tileWidth = tileWidth;
    this.tileVisibilityRadius = tileVisibilityRadius;
    this.knownCells = new Map<string, Cell>();
  }

  private getCanonicalCell(cell: Cell): Cell {
    const { i, j } = cell;
    const key = [i, j].toString();

    // Add Cell if it does not exist
    if (!this.knownCells.has(key)) {
      this.knownCells.set(key, cell)!;
    }
    return this.knownCells.get(key)!;
  }

  getCellForPoint(point: leaflet.LatLng): Cell {
    return this.getCanonicalCell({
      i: Math.floor(point.lat / this.tileWidth),
      j: Math.floor(point.lng / this.tileWidth),
      // i: Math.floor(point.lat),
      // j: Math.floor(point.lng),
    });
  }

  getCellBounds(cell: Cell): leaflet.LatLngBounds {
    const bounds = leaflet.latLng(
      cell.i * this.tileWidth,
      cell.j * this.tileWidth,
    );
    return leaflet.latLng(bounds);
  }

  getCellsNearPoint(point: leaflet.LatLng): Cell[] {
    const resultCells: Cell[] = [];
    const originCell = this.getCellForPoint(point);
    for (
      let c = -this.tileVisibilityRadius;
      c <= this.tileVisibilityRadius;
      c++
    ) {
      for (
        let r = -this.tileVisibilityRadius;
        r <= this.tileVisibilityRadius;
        r++
      ) {
        resultCells.push(
          this.getCanonicalCell({
            i: originCell.i + c,
            j: originCell.j + r,
          }),
        );
      }
    }
    return resultCells;
  }
}
