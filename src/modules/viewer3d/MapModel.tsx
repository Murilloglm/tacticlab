import { useEffect, useMemo, useState } from 'react';
import { DoubleSide, TextureLoader, type Texture, SRGBColorSpace } from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import { worldToMap } from '../coordinates';
import { findMap, useCatalog } from '../catalog/catalogStore';
import { useEditor } from '../editor/editorStore';
import { interaction } from '../editor/interaction';
import { useDoc } from '../strategy/docStore';
import { ignoreSceneEvent, syncOrbitEnabled } from '../ghostcam/CameraRig';
import { labelTexture } from './labels';
import { buildExtrudedGeometry, buildFloorGeometry, polylineOverTerrain, SCHEMATIC_HEIGHTS } from './mapMeshes';
import { Billboard } from './Billboard';

function useMinimapTexture(url: string | undefined, enabled: boolean): Texture | null {
  const [texture, setTexture] = useState<Texture | null>(null);
  useEffect(() => {
    if (!enabled || !url) return;
    let cancelled = false;
    const loader = new TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(
      url,
      (loaded) => {
        if (cancelled) return;
        loaded.colorSpace = SRGBColorSpace;
        setTexture(loaded);
      },
      undefined,
      () => setTexture(null),
    );
    return () => {
      cancelled = true;
    };
  }, [url, enabled]);
  return enabled ? texture : null;
}

export function MapModel() {
  const map = useEditor((s) => s.map);
  const frame = useEditor((s) => s.frame);
  const xray = useEditor((s) => s.xrayWalls);
  const minimapOnFloor = useEditor((s) => s.minimapOnFloor);
  const showCallouts = useEditor((s) => s.showCallouts);
  const catalog = useCatalog((s) => s.catalog);
  const mapId = useDoc((s) => s.doc?.mapId);
  const mapInfo = mapId ? findMap(catalog, mapId) : undefined;
  const floorTexture = useMinimapTexture(mapInfo?.displayIcon, minimapOnFloor);

  const meshes = useMemo(() => {
    if (!map) return null;
    return {
      floor: buildFloorGeometry(map.geometry, map.heights, frame),
      walls: buildExtrudedGeometry(map.geometry.walls, map.heights, frame, SCHEMATIC_HEIGHTS.wall),
      rails: buildExtrudedGeometry(map.geometry.rails, map.heights, frame, SCHEMATIC_HEIGHTS.rail),
      boxes: buildExtrudedGeometry(map.geometry.boxes, map.heights, frame, SCHEMATIC_HEIGHTS.box),
    };
  }, [map, frame]);

  useEffect(
    () => () => {
      meshes?.floor.dispose();
      meshes?.walls.dispose();
      meshes?.rails.dispose();
      meshes?.boxes.dispose();
    },
    [meshes],
  );

  const siteOutlines = useMemo(() => {
    if (!map) return [];
    const lines: Array<Array<[number, number, number]>> = [];
    for (const site of map.geometry.sites) {
      for (const polygon of site.polygons) {
        const ring = polygon[0];
        if (!ring) continue;
        const points = [];
        for (let i = 0; i < ring.length; i += 2) points.push({ x: ring[i]!, y: ring[i + 1]! });
        points.push(points[0]!);
        lines.push(polylineOverTerrain(points, frame, map.heights, 0.08));
      }
    }
    return lines;
  }, [map, frame]);

  if (!map || !meshes) return null;

  const onDown = (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0 || ignoreSceneEvent(event.nativeEvent.pointerType)) return;
    event.stopPropagation();
    const point = worldToMap(event.point.x, event.point.z, frame);
    interaction.down(point, null, { shift: event.shiftKey });
    syncOrbitEnabled();
  };

  return (
    <group onPointerDown={onDown}>
      <mesh geometry={meshes.floor} name="floor">
        {floorTexture ? (
          <meshLambertMaterial key="textured" map={floorTexture} transparent alphaTest={0.05} color="#ffffff" />
        ) : (
          <meshLambertMaterial key="plain" vertexColors side={DoubleSide} />
        )}
      </mesh>
      <mesh geometry={meshes.walls} name="walls">
        <meshLambertMaterial key={String(xray)} color="#262a31" side={DoubleSide} transparent={xray} opacity={xray ? 0.22 : 1} depthWrite={!xray} />
      </mesh>
      <mesh geometry={meshes.rails} name="rails">
        <meshLambertMaterial color="#7a818c" side={DoubleSide} />
      </mesh>
      <mesh geometry={meshes.boxes} name="boxes">
        <meshLambertMaterial color="#5b6470" side={DoubleSide} />
      </mesh>

      {siteOutlines.map((points, index) => (
        <Line key={index} points={points} color="#ef3b48" lineWidth={2} raycast={() => null} />
      ))}

      {map.geometry.sites.map((site) => (
        <Billboard key={site.label} point={site.center} lift={5.5} size={3} growFrom={50} texture={labelTexture(site.label, { weight: 800, color: '#ffffff', background: '#ef3b48' })} />
      ))}

      {showCallouts &&
        map.geometry.callouts
          .filter((callout) => !callout.site)
          .map((callout, index) => (
            <Billboard
              key={index}
              point={callout}
              lift={2.2}
              size={1.15}
              growFrom={50}
              opacity={0.86}
              texture={labelTexture(callout.name, { color: '#e8eaee', weight: 500 })}
            />
          ))}

      {map.geometry.features.map((feature, index) => (
        <Billboard key={index} point={feature} lift={3} size={1.15} growFrom={50} texture={labelTexture('Teleporte', { color: '#2ad6b4', weight: 600 })} />
      ))}
    </group>
  );
}
