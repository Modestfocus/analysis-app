#!/usr/bin/env python3
"""
MiDaS DPT-Hybrid depth map generator for chart analysis.
Generates grayscale depth maps from trading chart images.
"""

import sys
import os
import argparse
import json
from pathlib import Path
import numpy as np

try:
    import torch
    import cv2
    from PIL import Image
    import torchvision.transforms as transforms
    DEPENDENCIES_AVAILABLE = True
except ImportError as e:
    DEPENDENCIES_AVAILABLE = False
    MISSING_DEPS = str(e)

class MiDaSDepthGenerator:
    def __init__(self):
        """Initialize MiDaS DPT-Hybrid model for depth estimation."""
        if not DEPENDENCIES_AVAILABLE:
            raise ImportError(f"Required dependencies not available: {MISSING_DEPS}")
        
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        print(f"Using device: {self.device}")
        
        try:
            # Load MiDaS DPT-Hybrid model
            self.model = torch.hub.load("intel-isl/MiDaS", "DPT_Hybrid", pretrained=True)
            self.model.to(self.device)
            self.model.eval()
            
            # Load MiDaS transforms
            self.midas_transforms = torch.hub.load("intel-isl/MiDaS", "transforms")
            self.transform = self.midas_transforms.dpt_transform
            
            print("✓ MiDaS DPT-Hybrid model loaded successfully")
            
        except Exception as e:
            raise RuntimeError(f"Failed to load MiDaS model: {str(e)}")

    def generate_depth_map(self, input_path, output_path):
        """
        Generate depth map from input image and save as grayscale PNG.
        
        Args:
            input_path: Path to input chart image
            output_path: Path where depth map should be saved
            
        Returns:
            dict with success status and details
        """
        try:
            # Load and preprocess image
            img = cv2.imread(input_path)
            if img is None:
                return {"error": f"Could not load image: {input_path}"}
            
            img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            
            # Apply MiDaS transforms
            input_tensor = self.transform(img_rgb).to(self.device)
            
            # Generate depth map
            with torch.no_grad():
                prediction = self.model(input_tensor)
                
                # Convert to numpy and resize to original image size
                prediction = torch.nn.functional.interpolate(
                    prediction.unsqueeze(1),
                    size=img_rgb.shape[:2],
                    mode="bicubic",
                    align_corners=False,
                ).squeeze()
                
                depth_map = prediction.cpu().numpy()
            
            # Normalize depth map to 0-255 range
            depth_min = depth_map.min()
            depth_max = depth_map.max()
            
            if depth_max > depth_min:
                depth_normalized = (depth_map - depth_min) / (depth_max - depth_min)
            else:
                depth_normalized = np.zeros_like(depth_map)
            
            depth_uint8 = (depth_normalized * 255).astype(np.uint8)
            
            # Save as grayscale PNG
            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            depth_pil = Image.fromarray(depth_uint8, mode='L')
            depth_pil.save(output_path, 'PNG')
            
            return {
                "success": True,
                "input": input_path,
                "output": output_path,
                "depth_range": [float(depth_min), float(depth_max)],
                "model": "MiDaS DPT-Hybrid"
            }
            
        except Exception as e:
            return {"error": f"Depth map generation failed: {str(e)}"}

    def process_batch(self, input_dir, output_dir):
        """
        Process all images in a directory.
        
        Args:
            input_dir: Directory containing input images
            output_dir: Directory where depth maps should be saved
            
        Returns:
            dict with batch processing results
        """
        input_path = Path(input_dir)
        output_path = Path(output_dir)
        
        if not input_path.exists():
            return {"error": f"Input directory does not exist: {input_dir}"}
        
        # Find all image files
        image_extensions = {'.png', '.jpg', '.jpeg', '.bmp', '.tiff'}
        image_files = [f for f in input_path.iterdir() 
                      if f.suffix.lower() in image_extensions]
        
        if not image_files:
            return {"error": "No image files found in input directory"}
        
        results = []
        
        for img_file in image_files:
            # Generate output filename
            output_file = output_path / f"depth_{img_file.stem}.png"
            
            # Process single image
            result = self.generate_depth_map(str(img_file), str(output_file))
            results.append({
                "file": img_file.name,
                "result": result
            })
            
        return {
            "batch_results": results,
            "total_processed": len(results),
            "success_count": sum(1 for r in results if r["result"].get("success", False))
        }

def create_fallback_depth_map(input_path, output_path):
    """
    Create a fallback depth map when MiDaS is not available.
    Uses simple edge detection and blur to simulate depth.
    """
    try:
        import cv2
        from PIL import Image
        
        # Load image
        img = cv2.imread(input_path, cv2.IMREAD_GRAYSCALE)
        if img is None:
            return {"error": f"Could not load image: {input_path}"}
        
        # Apply edge detection
        edges = cv2.Canny(img, 50, 150)
        
        # Create depth-like effect by inverting and blurring
        depth_sim = 255 - edges
        depth_blur = cv2.GaussianBlur(depth_sim, (15, 15), 0)
        
        # Save as PNG
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        cv2.imwrite(output_path, depth_blur)
        
        return {
            "success": True,
            "input": input_path,
            "output": output_path,
            "model": "Fallback Edge-based Depth Simulation"
        }
        
    except Exception as e:
        return {"error": f"Fallback depth generation failed: {str(e)}"}

def main():
    parser = argparse.ArgumentParser(description='Generate depth maps using MiDaS DPT-Hybrid')
    parser.add_argument('--input', required=True, help='Input image file or directory')
    parser.add_argument('--output', help='Output file or directory (optional for single files)')
    parser.add_argument('--batch', action='store_true', help='Process all images in input directory')
    
    args = parser.parse_args()
    
    try:
        if DEPENDENCIES_AVAILABLE:
            generator = MiDaSDepthGenerator()
            
            if args.batch:
                # Batch processing
                output_dir = args.output or os.path.join(os.path.dirname(args.input), 'depthmaps')
                result = generator.process_batch(args.input, output_dir)
            else:
                # Single file processing
                if args.output:
                    output_path = args.output
                else:
                    # Auto-generate output path
                    input_path = Path(args.input)
                    output_path = input_path.parent / 'depthmaps' / f"depth_{input_path.stem}.png"
                
                result = generator.generate_depth_map(args.input, str(output_path))
        else:
            # Fallback mode
            if args.batch:
                result = {"error": "Batch mode not supported in fallback mode"}
            else:
                output_path = args.output or str(Path(args.input).parent / 'depthmaps' / f"depth_{Path(args.input).stem}.png")
                result = create_fallback_depth_map(args.input, output_path)
        
        print(json.dumps(result, indent=2))
        
    except Exception as e:
        error_result = {"error": f"Script execution failed: {str(e)}"}
        print(json.dumps(error_result, indent=2))
        sys.exit(1)

if __name__ == "__main__":
    main()