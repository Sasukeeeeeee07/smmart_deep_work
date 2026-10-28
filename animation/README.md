# 3D Animation & Models Directory

This folder is dedicated to storing 3D assets, CAD/Blender files, textures, and web-ready animations for the SmartDesk project.

---

## 📁 Directory Structure

```
animation/
├── models/         <-- Put your 3D models here (.glb, .gltf, .obj, .fbx, .blend)
├── textures/       <-- Textures, normal maps, roughness maps (.png, .jpg, .hdr)
└── README.md
```

---

## 🌐 Web Delivery (`frontend/public/animation/`)

To display 3D models inside the React dashboard / web application (using Three.js, React Three Fiber, Spline, or `<model-viewer>`):

1. **Place your `.glb` or `.gltf` file** inside:
   ```
   frontend/public/animation/your-model.glb
   ```
2. **Access directly in the frontend**:
   Any file inside `frontend/public/animation/` is served at the URL:
   ```
   /animation/your-model.glb
   ```

---

## 🚀 Recommended Formats & Best Practices

| Format | Purpose | Recommendation |
|---|---|---|
| **`.glb`** | **Web / Three.js / R3F** | **Recommended** (Single binary file containing mesh + textures + animations) |
| **`.gltf`** | Web / Three.js | Good for inspecting JSON structure, but requires accompanying `.bin` and texture files |
| **`.blend`** | Source files | Keep original Blender files in `animation/models/` for future edits |
| **`.fbx` / `.obj`** | Interchange | Good for transferring between Blender, Maya, and 3ds Max |

### Optimization Tips for Fast Web Loading
- **Compress with Draco or Meshopt**: Keeps file size under 5MB for instant browser loading.
- **Max Poly Count**: Target under 50,000 - 100,000 polygons for smooth 60fps rendering on laptops and mobile devices.
- **Embedded Textures**: 1K or 2K resolution textures (`.webp` or compressed `.png`).

---

## 💻 Example Code: Loading a 3D Model in React

### Using `@react-three/drei` and `@react-three/fiber`:

```tsx
import { Canvas } from '@react-three/fiber';
import { useGLTF, OrbitControls, Environment } from '@react-three/drei';

function SmartDeskModel() {
  const { scene } = useGLTF('/animation/smartdesk.glb');
  return <primitive object={scene} scale={1.5} />;
}

export function SmartDeskCanvas() {
  return (
    <Canvas camera={{ position: [0, 2, 5], fov: 45 }}>
      <ambientLight intensity={0.7} />
      <directionalLight position={[10, 10, 5]} intensity={1.2} />
      <SmartDeskModel />
      <OrbitControls autoRotate />
      <Environment preset="city" />
    </Canvas>
  );
}
```
