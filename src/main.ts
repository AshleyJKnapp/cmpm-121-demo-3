// @deno-types="npm:@types/leaflet@^1.9.14"
import leaflet, { LatLng } from "leaflet";
import { Board } from "./board.ts";

// Style sheets
import "leaflet/dist/leaflet.css";
import "./style.css";

// Fix missing marker images
import "./leafletWorkaround.ts";

// Deterministic random number generator
import luck from "./luck.ts";

// ------------------------------------------------------
// ------ CONSTANTS ------
// ------------------------------------------------------
// Location of our classroom (as identified on Google Maps)
const OAKES_CLASSROOM = leaflet.latLng(36.98949379578401, -122.06277128548504);

// Tunable gameplay parameters
const GAMEPLAY_ZOOM_LEVEL = 19;
const GAMEPLAY_MIN_ZOOM_LEVEL = 18;
const GAMEPLAY_MAX_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;

// Create the map (element with id "map" is defined in index.html)
const map = leaflet.map(document.getElementById("map")!, {
  center: OAKES_CLASSROOM,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_MIN_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_MAX_ZOOM_LEVEL,
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

// ------------------------------------------------------
// ------ DATA STRUCTURES ------
// ------------------------------------------------------
interface Coin {
  i: number;
  j: number;
  serial: number;
}

interface Momento<T> {
  toMomento(): T;
  fromMomento(momento: T): void;
}

class Geocache implements Momento<string> {
  i: number;
  j: number;
  coins: Coin[];
  constructor() {
    this.i = 0;
    this.j = 1;
    //this.numCoins = 0;
    this.coins = [];
  }
  toMomento() {
    const coinsJson = JSON.stringify(this.coins);
    return JSON.stringify({ i: this.i, j: this.j, coins: coinsJson });
  }

  fromMomento(momento: string) {
    const parsedObj = JSON.parse(momento);
    this.coins.length = 0;
    this.i = parsedObj.i;
    this.j = parsedObj.j;
    const parsedCoins = JSON.parse(parsedObj.coins);
    for (let k = 0; k < parsedCoins.length; k++) {
      const newi = parsedCoins[k].i;
      const newj = parsedCoins[k].j;
      const newSerial = parsedCoins[k].serial;
      const newCoin = { i: newi, j: newj, serial: newSerial };
      this.coins.push(newCoin);
    }
  }
}

// --------------------------------------------------------------------
// ------ INITIALIZATIONS & SET UP ------
// --------------------------------------------------------------------
// Add a marker to represent the player
let playerLocation: leaflet.LatLng = OAKES_CLASSROOM;
const playerMarker = leaflet.marker(playerLocation);
let geoLocationToggle = false;
playerMarker.bindTooltip("That's you!");
playerMarker.addTo(map);

// Display the player's points
let playerCoins: Coin[] = [];
const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!;

// Custom icon for cache spots
const cacheIconArray: leaflet.Layer[] = [];
const cacheIcon = new leaflet.DivIcon({
  className: "custom-cache-icon",
  html: '<font size="5">🎄</font>',
  iconSize: [0, 0],
  iconAnchor: [0, 0],
});

// Grid System for displaying caches on
const mapBoard = new Board(TILE_DEGREES, NEIGHBORHOOD_SIZE);

// Temporary Data Storage
const geocacheArr: Geocache[] = [];
let momentoArr: string[] = [];

function updatePolyline() {
  const singleLine = [];
  singleLine.push(playerMarker.getLatLng());
  singleLine.push(playerLocation);
  leaflet.polyline(singleLine, { color: "red" }).addTo(map);
}

// --------------------------------------------------------------------
// ------ PLAYER MOVEMENT ------
// --------------------------------------------------------------------
// Moves the player and spawns/regenerates caches around them
const playerMoved = new Event("player-moved");
document.addEventListener("player-moved", function () {
  updatePolyline();
  playerMarker.setLatLng(playerLocation);
  map.panTo(playerLocation);
  storePlayerLoc();
  updateMomento();
  clearCacheMarker(); // Clear current markers before redrawing
  spawnCache(playerLocation); // Spawn in caches surrounding the player
});

// Move the player to lat, lng
function playerMoveTo(lat: number, lng: number) {
  playerLocation = leaflet.latLng(lat, lng);
  document.dispatchEvent(playerMoved);
}

function geoMoveTo(showLine: boolean) {
  map.locate({ watch: true });
  if (!showLine) {
    // Set player marker so the move does not draw a line, in case of a large jump
    playerMarker.setLatLng(playerLocation);
    document.dispatchEvent(playerMoved);
  } else {
    document.dispatchEvent(playerMoved);
  }
}

map.addEventListener("locationfound", function (event) {
  playerLocation = event.latlng;
  document.dispatchEvent(playerMoved);
});

// -- Movement Buttons --
const sensorBtn = document.querySelector<HTMLButtonElement>("#sensor")!;
sensorBtn.addEventListener("click", function () {
  geoLocationToggle = !geoLocationToggle;
  geoMoveTo(false);
  // document.dispatchEvent(playerMoved);
});

const northBtn = document.querySelector<HTMLButtonElement>("#north")!;
northBtn.addEventListener("click", function () {
  playerMoveTo(playerLocation.lat + TILE_DEGREES, playerLocation.lng);
});

const southBtn = document.querySelector<HTMLButtonElement>("#south")!;
southBtn.addEventListener("click", function () {
  playerMoveTo(playerLocation.lat - TILE_DEGREES, playerLocation.lng);
});

const westBtn = document.querySelector<HTMLButtonElement>("#west")!;
westBtn.addEventListener("click", function () {
  playerMoveTo(playerLocation.lat, playerLocation.lng - TILE_DEGREES);
});

const eastBtn = document.querySelector<HTMLButtonElement>("#east")!;
eastBtn.addEventListener("click", function () {
  playerMoveTo(playerLocation.lat, playerLocation.lng + TILE_DEGREES);
});

// -- Trash Data --
const trashBtn = document.querySelector<HTMLButtonElement>("#reset")!;
trashBtn.addEventListener("click", function () {
  if (confirm("Reset your game?\n(This cannot be undone)")) {
    resetGame();
  }
});

// --------------------------------------------------------------------
// ------ CACHE SPAWNING ------
// --------------------------------------------------------------------
// Add caches to the map
function spawnCache(origin: leaflet.LatLng) {
  // Look at all cells around the provided origin
  // Check each cell for luck and instantiate a cache if it is lucky
  const cellArr = mapBoard.getCellsNearPoint(origin);
  cellArr.forEach((cell) => {
    if (
      luck([cell.i, cell.j].toString()) < CACHE_SPAWN_PROBABILITY
    ) {
      const momentoIdx = searchMomento(cell.i, cell.j);
      let cache = new Geocache();
      if (momentoIdx == null) {
        cache = instantiateCache(cell.i, cell.j);
      } else {
        cache.fromMomento(momentoArr[momentoIdx]);
      }
      drawCache(cache);
    }
  });
}

// Clear the cache markers from the map
function clearCacheMarker() {
  for (let i = 0; i < cacheIconArray.length; i++) {
    map.removeLayer(cacheIconArray[i]);
  }
  cacheIconArray.length = 0;
}

// Creates a cache for the first time
function instantiateCache(i: number, j: number): Geocache {
  const cache = new Geocache();
  cache.i = i;
  cache.j = j;
  cache.coins = [];
  geocacheArr.push(cache);

  // Each cache has a random number of coins, mutable by the player
  const pointValue = Math.floor(luck([i, j, "initialValue"].toString()) * 100);
  // Spawn coins in
  for (let k = 0; k < pointValue; k++) {
    const coin: Coin = { i: i, j: j, serial: k };
    cache.coins.push(coin);
  }

  return cache;
}

// Transfers an amount from the sender Coin[] to reciever Coin[]
// Returns the transferred coin if successful, null otherwise
// *Note: currently doesn't support multiple coins
function transferCoins(sender: Coin[], reciever: Coin[], amt: number) {
  if (sender.length >= amt) {
    const tempCoin = sender.pop()!;
    reciever.push(tempCoin); // I'll be honest, I do not remember if this line works.
    return tempCoin;
  } else {
    return null;
  }
}

// Draws the cache onto the map, as well as enables the pop up for interacting
function drawCache(cache: Geocache) {
  // Add a marker to the map to represent the cache
  // and push into array for deletion later
  const bounds = mapBoard.getCellBounds({ i: cache.i, j: cache.j }); // Simplified coords of cache for drawing icon
  const cacheMarker = leaflet.marker(bounds, { icon: cacheIcon });
  cacheMarker.addTo(map);
  cacheIconArray.push(cacheMarker);

  // Handle interactions with the cache
  cacheMarker.bindPopup(() => {
    // The popup offers a description and button
    const popupDiv = document.createElement("div");
    popupDiv.innerHTML = `
                <div>There is a Christmas tree here at "${cache.i},${cache.j}". It has <span id="value">${cache.coins.length}</span> presents</span>.</div>
                <button id="collect">Steal 🎁</button>
                <button id="deposit">Give 🎁</button>`;

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
            `Stolen present ${transferred.i}:${transferred.j}#${transferred.serial}<br>${playerCoins.length} presents stolen`;
          cacheValueChanged();
        } else {
          alert("There's no more presents to give.");
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
            `Given present ${transferred.i}:${transferred.j}#${transferred.serial}<br>${playerCoins.length} presents stolen`;
          cacheValueChanged();
        } else {
          alert("Your sack is empty.");
        }
      });

    return popupDiv;
  });
}

// -- Momento Temporary Data Storage --
// Searches the momento array for a matching cell, returning the index of the item if found, and null otherwise
function searchMomento(i: number, j: number): number | null {
  // Look for item i,j in momentoArr
  for (let m = 0; m < momentoArr.length; m++) {
    const parsedObj = JSON.parse(momentoArr[m]);
    if (parsedObj.i == i && parsedObj.j == j) {
      return m;
    }
  }

  // If cache i,j was not in momento:
  return null;
}

// Updates the momento by inserting the cache into the array, while removing the original if it exists
function appendToMomento(cache: Geocache) {
  // If the momento of this cache exists, remove it
  const momentoIdx = searchMomento(cache.i, cache.j);
  if (momentoIdx != null) {
    momentoArr.splice(momentoIdx, 1);
  }

  // Insert the cache intormation into the momento array
  momentoArr.push(cache.toMomento());
}

function updateMomento() {
  for (let i = 0; i < geocacheArr.length; i++) {
    appendToMomento(geocacheArr[i]);
  }
  storeMomentoArr();
}

// -- Persistant Data Storage --
// Generated cache/momento data
function storeMomentoArr() {
  const momentoStr = JSON.stringify(momentoArr);
  localStorage.setItem("momento data", momentoStr);
}

function readMomentoData() {
  const momentoData = localStorage.getItem("momento data");
  if (momentoData) {
    const parsedCaches = JSON.parse(momentoData);
    momentoArr = parsedCaches;
    parsedCaches.forEach((cacheStr: string) => {
      const item = new Geocache();
      item.fromMomento(cacheStr);
      geocacheArr.push(item);
    });
  }
}

// Player Location Data
function storePlayerLoc() {
  const playerStr = JSON.stringify(playerLocation);
  localStorage.setItem("Player Location", playerStr);
}

function readPlayerLoc() {
  const playerData = localStorage.getItem("Player Location");
  if (playerData) {
    const parsedData = JSON.parse(playerData);
    playerLocation.lat = parsedData.lat;
    playerLocation.lng = parsedData.lng;
    playerMarker.setLatLng(playerLocation);
    map.panTo(playerLocation);
  }
}

// Player Coins Data
function storePlayerCoins() {
  const coinsStr = JSON.stringify(playerCoins);
  localStorage.setItem("Player Coins", coinsStr);
  readPlayerLoc();
}

function readPlayerCoins() {
  const pCoins = localStorage.getItem("Player Coins");
  if (pCoins) {
    const parsedData = JSON.parse(pCoins);
    playerCoins = parsedData;
  }
}

function cacheValueChanged() {
  updateMomento();
  storeMomentoArr();
  storePlayerCoins();
}

function restoreData() {
  readMomentoData();
  readPlayerLoc();
  readPlayerCoins();
}

function resetGame() {
  playerLocation = leaflet.latLng(36.98949379578401, -122.06277128548504);
  document.dispatchEvent(playerMoved);
  // Clear Polylines
  map.eachLayer((layer) => {
    if (layer instanceof leaflet.Polyline) {
      map.removeLayer(layer);
    }
  });
  localStorage.clear();
}

// --------------------------------------------------------------------
// ------ INITIAL LOAD ------
// --------------------------------------------------------------------

// Check if localsotage has data to restore
if (localStorage.length >= 0) {
  restoreData();
}
spawnCache(playerLocation);
