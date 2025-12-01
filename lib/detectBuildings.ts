import type { LatLng as MapLatLng } from "react-native-maps";
import { getGoogleMapsApiKey } from "./googleMaps";

const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
const GOOGLE_GEOCODE_ENDPOINT =
  "https://maps.googleapis.com/maps/api/geocode/json";
const EARTH_RADIUS_METERS = 6378137;

export interface DetectedBuilding {
  id: string;
  latitude: number;
  longitude: number;
  address: string;
  buildingNumber?: number;
  source: "osm" | "simulated";
}

export interface BuildingDetectionResult {
  buildings: DetectedBuilding[];
  warnings: string[];
}

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

const withRetries = async <T>(
  task: () => Promise<T>,
  options?: { attempts?: number; initialDelayMs?: number }
): Promise<T> => {
  const attempts = Math.max(1, options?.attempts ?? 3);
  const initialDelayMs = options?.initialDelayMs ?? 500;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        const delay = initialDelayMs * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
};

const convertToCartesian = (
  point: MapLatLng,
  referenceLatitude: number
): { x: number; y: number } => {
  const x =
    toRadians(point.longitude) *
    EARTH_RADIUS_METERS *
    Math.cos(toRadians(referenceLatitude));
  const y = toRadians(point.latitude) * EARTH_RADIUS_METERS;
  return { x, y };
};

const calculatePolygonArea = (polygon: MapLatLng[]): number => {
  if (polygon.length < 3) {
    return 0;
  }
  const referenceLatitude =
    polygon.reduce((sum, point) => sum + point.latitude, 0) / polygon.length;
  const points = polygon.map((point) =>
    convertToCartesian(point, referenceLatitude)
  );
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    sum += current.x * next.y - next.x * current.y;
  }
  return Math.abs(sum) / 2;
};

const isPointInPolygon = (point: MapLatLng, polygon: MapLatLng[]): boolean => {
  if (polygon.length < 3) {
    return false;
  }
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].longitude;
    const yi = polygon[i].latitude;
    const xj = polygon[j].longitude;
    const yj = polygon[j].latitude;

    const intersects =
      yi > point.latitude !== yj > point.latitude &&
      point.longitude <
        ((xj - xi) * (point.latitude - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
};

interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

const getBoundingBox = (polygon: MapLatLng[]): BoundingBox => {
  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  let minLng = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;

  polygon.forEach((point) => {
    minLat = Math.min(minLat, point.latitude);
    maxLat = Math.max(maxLat, point.latitude);
    minLng = Math.min(minLng, point.longitude);
    maxLng = Math.max(maxLng, point.longitude);
  });

  return { minLat, maxLat, minLng, maxLng };
};

const fetchBuildingsFromOSM = async (
  polygon: MapLatLng[],
  boundingBox: BoundingBox
): Promise<Array<{ id: string; latitude: number; longitude: number }>> => {
  const { minLat, maxLat, minLng, maxLng } = boundingBox;

  console.log("🏗️ [OSM] Fetching buildings from OpenStreetMap", {
    boundingBox: { minLat, maxLat, minLng, maxLng },
    polygonPoints: polygon.length,
  });

  const query = `
    [out:json];
    (
      way["building"](${minLat},${minLng},${maxLat},${maxLng});
      relation["building"](${minLat},${minLng},${maxLat},${maxLng});
      node["building"](${minLat},${minLng},${maxLat},${maxLng});
    );
    out center;
  `;

  try {
    const url = `${OVERPASS_ENDPOINT}?data=${encodeURIComponent(query)}`;
    console.log("🌐 [OSM] Calling Overpass API:", OVERPASS_ENDPOINT);

    const response = await withRetries(() => fetch(url), {
      attempts: 3,
      initialDelayMs: 800,
    });

    console.log(
      "📡 [OSM] Overpass API response status:",
      response.status,
      response.statusText
    );

    if (!response.ok) {
      console.warn(
        "⚠️ [OSM] Overpass API returned non-OK status:",
        response.status,
        response.statusText
      );
      // Return empty array instead of throwing - this is a non-critical failure
      return [];
    }

    const data = await response.json();
    console.log("📊 [OSM] Overpass API response:", {
      hasElements: Array.isArray(data?.elements),
      elementCount: data?.elements?.length || 0,
      remark: data?.remark,
    });

    if (!Array.isArray(data?.elements)) {
      console.warn("⚠️ [OSM] Response missing elements array");
      return [];
    }

    const candidates: Array<{
      id: string;
      latitude: number;
      longitude: number;
    }> = [];

    data.elements.forEach((element: any) => {
      if (!element) {
        return;
      }
      let latitude: number | undefined;
      let longitude: number | undefined;

      if (typeof element.lat === "number" && typeof element.lon === "number") {
        latitude = element.lat;
        longitude = element.lon;
      } else if (
        typeof element.center?.lat === "number" &&
        typeof element.center?.lon === "number"
      ) {
        latitude = element.center.lat;
        longitude = element.center.lon;
      } else if (
        Array.isArray(element.geometry) &&
        element.geometry.length > 0 &&
        typeof element.geometry[0]?.lat === "number" &&
        typeof element.geometry[0]?.lon === "number"
      ) {
        latitude = element.geometry[0].lat;
        longitude = element.geometry[0].lon;
      }

      if (
        typeof latitude === "number" &&
        Number.isFinite(latitude) &&
        typeof longitude === "number" &&
        Number.isFinite(longitude)
      ) {
        const point = { latitude, longitude };
        if (isPointInPolygon(point, polygon)) {
          candidates.push({
            id: String(element.id),
            latitude,
            longitude,
          });
        }
      }
    });

    console.log(
      "✅ [OSM] Found",
      candidates.length,
      "buildings within polygon"
    );
    return candidates;
  } catch (error) {
    // OSM API failure is non-critical - return empty array and let the function continue
    // with simulated buildings if needed
    console.error(
      "❌ [OSM] Failed to fetch buildings from OpenStreetMap:",
      error
    );
    return [];
  }
};

const reverseGeocode = async (
  latitude: number,
  longitude: number
): Promise<{ address: string; buildingNumber?: number; warning?: string }> => {
  let apiKey = getGoogleMapsApiKey();

  // Fallback to hardcoded key if not found (for real device compatibility)
  if (!apiKey) {
    console.warn(
      "⚠️ Google Maps API key not found in config, using fallback key"
    );
    apiKey = "AIzaSyCe1aICpk2SmN3ArHwp-79FnsOk38k072M";
  }

  if (!apiKey) {
    return {
      address: `Building at ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
      warning:
        "Google Maps API key not configured. Using coordinates as addresses.",
    };
  }

  const url = `${GOOGLE_GEOCODE_ENDPOINT}?latlng=${latitude},${longitude}&key=${apiKey}`;
  try {
    const response = await withRetries(() => fetch(url), {
      attempts: 2,
      initialDelayMs: 400,
    });
    const data = await response.json();
    if (
      data.status === "OK" &&
      Array.isArray(data.results) &&
      data.results[0]
    ) {
      const formatted = data.results[0].formatted_address;
      const address =
        formatted ||
        `Building at ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
      const houseNumberMatch = address.match(/^(\d+)[^\d]?/);
      return {
        address,
        buildingNumber: houseNumberMatch
          ? Number(houseNumberMatch[1])
          : undefined,
      };
    }
  } catch (error) {
    console.warn(
      "[detectBuildings] reverseGeocode failed:",
      (error as Error)?.message || error
    );
  }
  return {
    address: `Building at ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
  };
};

const generateRandomPointInPolygon = (
  polygon: MapLatLng[],
  boundingBox: BoundingBox
): MapLatLng | null => {
  const { minLat, maxLat, minLng, maxLng } = boundingBox;
  for (let attempts = 0; attempts < 30; attempts += 1) {
    const latitude = minLat + Math.random() * (maxLat - minLat);
    const longitude = minLng + Math.random() * (maxLng - minLng);
    const point = { latitude, longitude };
    if (isPointInPolygon(point, polygon)) {
      return point;
    }
  }
  return null;
};

export const detectBuildingsForPolygon = async (
  polygon: MapLatLng[]
): Promise<BuildingDetectionResult> => {
  if (polygon.length < 3) {
    return { buildings: [], warnings: [] };
  }

  const warnings: string[] = [];
  const area = calculatePolygonArea(polygon);
  const targetCount = Math.max(3, Math.min(50, Math.round(area / 400)));
  const boundingBox = getBoundingBox(polygon);
  let detectedBuildings: DetectedBuilding[] = [];

  // 1️⃣ Try to fetch real buildings from OSM (non-blocking - continue even if it fails)
  let osmBuildings: Array<{ id: string; latitude: number; longitude: number }> =
    [];
  try {
    console.log("🔍 [detectBuildings] Starting OSM building detection...");
    osmBuildings = await fetchBuildingsFromOSM(polygon, boundingBox);
    console.log(
      "📦 [detectBuildings] OSM returned",
      osmBuildings.length,
      "buildings"
    );
  } catch (error) {
    // OSM failure is non-critical - continue with simulated buildings
    const errorMessage = (error as Error)?.message || String(error);
    console.error(
      "❌ [detectBuildings] Error fetching OSM buildings:",
      errorMessage
    );
    if (
      !errorMessage.includes("OpenStreetMap") &&
      !errorMessage.includes("Overpass")
    ) {
      console.warn("[detectBuildings] Unexpected error fetching OSM:", error);
    }
  }

  // 2️⃣ Process real OSM buildings and geocode them
  for (let i = 0; i < osmBuildings.length; i += 1) {
    const building = osmBuildings[i];
    try {
      const geocodeResult = await reverseGeocode(
        building.latitude,
        building.longitude
      );
      if (geocodeResult.warning && !warnings.includes(geocodeResult.warning)) {
        warnings.push(geocodeResult.warning);
      }
      detectedBuildings.push({
        id: `osm-${building.id}`,
        latitude: building.latitude,
        longitude: building.longitude,
        address: geocodeResult.address,
        buildingNumber: geocodeResult.buildingNumber,
        source: "osm",
      });
      if (detectedBuildings.length >= targetCount) {
        break;
      }
    } catch (error) {
      // Skip this building if geocoding fails, continue with others
      console.warn(
        `[detectBuildings] Failed to geocode building ${i + 1}:`,
        error
      );
    }
  }

  // 3️⃣ Always generate simulated buildings to fill gaps (even if OSM failed completely)
  if (detectedBuildings.length < targetCount) {
    const missing = targetCount - detectedBuildings.length;
    let simulatedCount = 0;

    for (let i = 0; i < missing; i += 1) {
      const randomPoint = generateRandomPointInPolygon(polygon, boundingBox);
      if (!randomPoint) {
        break;
      }
      detectedBuildings.push({
        id: `sim-${Date.now()}-${i}`,
        latitude: randomPoint.latitude,
        longitude: randomPoint.longitude,
        address: `Simulated building near ${randomPoint.latitude.toFixed(
          6
        )}, ${randomPoint.longitude.toFixed(6)}`,
        source: "simulated",
      });
      simulatedCount += 1;
    }

    if (simulatedCount > 0) {
      if (osmBuildings.length === 0) {
        warnings.push(
          "Unable to fetch real building data. Generated simulated buildings to approximate the area."
        );
      } else {
        warnings.push(
          "Limited real building data available. Added simulated buildings to approximate the area."
        );
      }
    }
  }

  // 4️⃣ Always return buildings (real + simulated), never empty
  return { buildings: detectedBuildings, warnings };
};
