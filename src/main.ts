// @deno-types="npm:@types/leaflet@^1.9.14"
import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css";
import "./style.css";

// Fix missing marker images
import "./leafletWorkaround.ts";

// Deterministic random number generator
import luck from "./luck.ts";

// Location of our classroom (as identified on Google Maps)
const OAKES_CLASSROOM = leaflet.latLng(36.98949379578401, -122.06277128548504);

// Tunable gameplay parameters
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;

// Create the map (element with id "map" is defined in index.html)
const map = leaflet.map(document.getElementById("map")!, {
  center: OAKES_CLASSROOM,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
  dragging: false,
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
  i: number;
  j: number;
}

interface Coin {
  cell: Cell;
}

interface Cache {
  coins: Coin[];
}

// Transfers an amount from the sender cache to reciever cache
// Returns true if successful, false otherwise
function transferCoins(sender: Cache, reciever: Cache, amt: number) {
  if (sender.coins.length >= amt) {
    const tempCoin = sender.coins.pop()!;
    reciever.coins.push(tempCoin);
    return true;
  } else {
    return false;
  }
}

// Display the player's points
const playerCache: Cache = { coins: [] };
// let playerPoints = 0;
const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!; // element `statusPanel` is defined in index.html
statusPanel.innerHTML = "No points yet...";

// Add caches to the map by cell numbers
function spawnCache(i: number, j: number) {
  // Convert cell numbers into lat/lng bounds
  const origin = OAKES_CLASSROOM;
  const bounds = leaflet.latLngBounds([
    [origin.lat + i * TILE_DEGREES, origin.lng + j * TILE_DEGREES],
    [origin.lat + (i + 1) * TILE_DEGREES, origin.lng + (j + 1) * TILE_DEGREES],
  ]);

  // Add a rectangle to the map to represent the cache
  const rect = leaflet.rectangle(bounds);
  rect.addTo(map);
  const cache: Cache = { coins: [] };

  // Each cache has a random point value, mutable by the player
  const pointValue = Math.floor(luck([i, j, "initialValue"].toString()) * 100);

  for (let i = 0; i < pointValue; i++) {
    const cell: Cell = { i, j };
    const coin: Coin = { cell };
    cache.coins.push(coin);
  }

  // Handle interactions with the cache
  rect.bindPopup(() => {
    // The popup offers a description and button
    const popupDiv = document.createElement("div");
    popupDiv.innerHTML = `
                <div>There is a cache here at "${i},${j}". It has value <span id="value">${cache.coins.length}</span>.</div>
                <button id="collect">collect</button>
                <button id="deposit">deposit</button>`;

    // Clicking the button decrements the cache's value and increments the player's points
    popupDiv
      .querySelector<HTMLButtonElement>("#collect")!
      .addEventListener("click", () => {
        // If transferring 1 from cache to playerCache succeeds
        if (transferCoins(cache, playerCache, 1)) {
          popupDiv.querySelector<HTMLSpanElement>("#value")!.innerHTML = cache
            .coins.length.toString();
          statusPanel.innerHTML =
            `${playerCache.coins.length} points accumulated`;
        } else {
          alert("you sucked it dry bruh");
        }
      });

    // Clicking the button increments the cache's value and decrements the player's points
    popupDiv
      .querySelector<HTMLButtonElement>("#deposit")!
      .addEventListener("click", () => {
        // If transferring 1 from playerCache to cache succeeds
        if (transferCoins(playerCache, cache, 1)) {
          popupDiv.querySelector<HTMLSpanElement>("#value")!.innerHTML = cache
            .coins.length.toString();
          statusPanel.innerHTML =
            `${playerCache.coins.length} points accumulated`;
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
