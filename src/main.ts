// @deno-types="npm:@types/leaflet@^1.9.14"
import leaflet from "leaflet";
import { Board } from "./board.ts";

// Style sheets
import "leaflet/dist/leaflet.css";
import "./style.css";

// Fix missing marker images
import "./leafletWorkaround.ts";

// Deterministic random number generator
import luck from "./luck.ts";
// const temp = new Board(5, 10);

// Location of our classroom (as identified on Google Maps)
const OAKES_CLASSROOM = leaflet.latLng(36.98949379578401, -122.06277128548504);

// Tunable gameplay parameters
const GAMEPLAY_ZOOM_LEVEL = 19;
const GAMEPLAY_MIN_ZOOM_LEVEL = 18;
// const GAMEPLAY_MAX_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;

// Create the map (element with id "map" is defined in index.html)
const map = leaflet.map(document.getElementById("map")!, {
  center: OAKES_CLASSROOM,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_MIN_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: true,
  dragging: true,
});

// Populate the map with a background tile layer
leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(map);

// Add a marker to represent the player
const playerMarker = leaflet.marker(OAKES_CLASSROOM);
playerMarker.bindTooltip("That's you!");
playerMarker.addTo(map);

interface Cell {
  readonly i: number;
  readonly j: number;
}

interface Coin {
  cell: Cell;
  serial: number;
}

interface Cache {
  coins: Coin[];
  cell: Cell;
}

// Transfers an amount from the sender Coin[] to reciever Coin[]
// Returns the transferred coin if successful, null otherwise
function transferCoins(sender: Coin[], reciever: Coin[], amt: number) {
  if (sender.length >= amt) {
    const tempCoin = sender.pop()!;
    reciever.push(tempCoin);
    return tempCoin;
  } else {
    return null;
  }
}

// Display the player's points
const playerCoins: Coin[] = [];
const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!; // element `statusPanel` is defined in index.html
statusPanel.innerHTML = "No points yet...";

// TODO: Implement player-inventory-changed
// Show all of the tokens the player owns

const mapBoard = new Board(TILE_DEGREES, NEIGHBORHOOD_SIZE);

// Add caches to the map by cell numbers
function spawnCache(i: number, j: number) {
  // Convert cell numbers into lat/lng bounds
  const origin = OAKES_CLASSROOM;
  i = origin.lat + i * TILE_DEGREES;
  j = origin.lng + j * TILE_DEGREES;

  // Set Cache location with flyweight
  const point: leaflet.LatLng = leaflet.latLng(i, j);
  const thisCell = mapBoard.getCellForPoint(point);
  const bounds = mapBoard.getCellBounds(thisCell);

  // Add a rectangle to the map to represent the cache
  const rect = leaflet.rectangle(bounds);
  rect.addTo(map);
  const cache: Cache = { coins: [], cell: thisCell };

  // Each cache has a random point value, mutable by the player
  const pointValue = Math.floor(luck([i, j, "initialValue"].toString()) * 100);

  for (let k = 0; k < pointValue; k++) {
    const cell: Cell = thisCell;
    const serial: number = k;
    const coin: Coin = { cell, serial };
    cache.coins.push(coin);
  }

  // Handle interactions with the cache
  rect.bindPopup(() => {
    // The popup offers a description and button
    const popupDiv = document.createElement("div");
    popupDiv.innerHTML = `
                <div>There is a cache here at "${thisCell.i},${thisCell.j}". It has <span id="value">${cache.coins.length}</span> coins</span>.</div>
                <button id="collect">collect</button>
                <button id="deposit">deposit</button>`;

    // Clicking the button decrements the cache's value and increments the player's points
    popupDiv
      .querySelector<HTMLButtonElement>("#collect")!
      .addEventListener("click", () => {
        const transferred = transferCoins(cache.coins, playerCoins, 1);
        // If transferring 1 from cache to playerCoins succeeds
        if (transferred) {
          popupDiv.querySelector<HTMLSpanElement>("#value")!.innerHTML = cache
            .coins.length.toString();
          statusPanel.innerHTML =
            `Collected Coin ${transferred.cell.i}:${transferred.cell.j}#${transferred.serial}<br>${playerCoins.length} points accumulated`;
        } else {
          alert("you sucked it dry bruh");
        }
      });

    // Clicking the button increments the cache's value and decrements the player's points
    popupDiv
      .querySelector<HTMLButtonElement>("#deposit")!
      .addEventListener("click", () => {
        const transferred = transferCoins(playerCoins, cache.coins, 1);
        // If transferring 1 from playerCache to cache succeeds
        if (transferred) {
          popupDiv.querySelector<HTMLSpanElement>("#value")!.innerHTML = cache
            .coins.length.toString();
          statusPanel.innerHTML =
            `Deposited Coin ${transferred.cell.i}:${transferred.cell.j}#${transferred.serial}<br>${playerCoins.length} points accumulated`;
        } else {
          alert("you are too broke bruh");
        }
      });

    return popupDiv;
  });
}

// Look around the player's neighborhood for caches to spawn
for (let i = -NEIGHBORHOOD_SIZE; i < NEIGHBORHOOD_SIZE; i++) {
  for (let j = -NEIGHBORHOOD_SIZE; j < NEIGHBORHOOD_SIZE; j++) {
    // If location i,j is lucky enough, spawn a cache!
    if (luck([i, j].toString()) < CACHE_SPAWN_PROBABILITY) {
      spawnCache(i, j);
    }
  }
}
