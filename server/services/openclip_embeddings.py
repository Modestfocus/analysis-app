#!/usr/bin/env python3
"""
OpenCLIP ViT-H/14 embedding service for chart similarity analysis.
Generates 1024-dimensional embeddings using OpenCLIP.
"""

import sys
import json
import base64
from io import BytesIO
import numpy as np

try:
    from PIL import Image
except ImportError:
    print(json.dumps({"error": "PIL/Pillow not installed"}))
    sys.exit(1)

# For now, simulate the OpenCLIP embedding until packages are properly installed
try:
    import open_clip
    import torch
    OPENCLIP_AVAILABLE = True
except ImportError:
    OPENCLIP_AVAILABLE = False

class OpenCLIPEmbedder:
    def __init__(self):
        """Initialize OpenCLIP ViT-H/14 model for 1024-dimensional embeddings."""
        if OPENCLIP_AVAILABLE:
            self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
            try:
                # Load OpenCLIP ViT-H/14 model (1024 dimensions)
                self.model, _, self.preprocess = open_clip.create_model_and_transforms(
                    'ViT-H-14', 
                    pretrained='laion2b_s32b_b79k',
                    device=self.device
                )
                self.model.eval()
                self.fallback = False
            except Exception as e:
                print(json.dumps({"error": f"Failed to load OpenCLIP model: {str(e)}"}))
                sys.exit(1)
        else:
            # Fallback mode with simulated embeddings
            self.fallback = True

    def generate_embedding(self, image_path_or_base64):
        """
        Generate 1024-dimensional embedding for an image.
        
        Args:
            image_path_or_base64: Either file path to image or base64 encoded image
            
        Returns:
            List of 1024 float values representing the image embedding
        """
        try:
            # Load image
            if image_path_or_base64.startswith('data:image'):
                # Handle base64 data URL
                header, encoded = image_path_or_base64.split(',', 1)
                image_data = base64.b64decode(encoded)
                image = Image.open(BytesIO(image_data)).convert('RGB')
            elif image_path_or_base64.startswith('/') or image_path_or_base64.startswith('./'):
                # Handle file path
                image = Image.open(image_path_or_base64).convert('RGB')
            else:
                # Handle raw base64
                image_data = base64.b64decode(image_path_or_base64)
                image = Image.open(BytesIO(image_data)).convert('RGB')
            
            if not self.fallback:
                # Real OpenCLIP processing
                image_tensor = self.preprocess(image).unsqueeze(0).to(self.device)
                
                # Generate embedding
                with torch.no_grad():
                    image_features = self.model.encode_image(image_tensor)
                    # Normalize the features
                    image_features = image_features / image_features.norm(dim=-1, keepdim=True)
                    
                # Convert to list for JSON serialization
                embedding = image_features.cpu().numpy().flatten().tolist()
                
                return {
                    "embedding": embedding,
                    "dimensions": len(embedding),
                    "model": "OpenCLIP ViT-H/14"
                }
            else:
                # Fallback: Generate deterministic 1024D embedding based on image properties
                import hashlib
                
                # Convert image to array for deterministic hash
                img_array = np.array(image.resize((224, 224)))
                img_hash = hashlib.md5(img_array.tobytes()).hexdigest()
                
                # Generate deterministic 1024D vector from hash
                np.random.seed(int(img_hash[:8], 16))
                embedding = np.random.normal(0, 1, 1024).astype(float)
                embedding = embedding / np.linalg.norm(embedding)  # Normalize
                
                return {
                    "embedding": embedding.tolist(),
                    "dimensions": 1024,
                    "model": "Fallback 1024D (install open-clip-torch for real OpenCLIP)"
                }
            
        except Exception as e:
            return {"error": f"Failed to generate embedding: {str(e)}"}

def main():
    """Main function to handle command line arguments."""
    if len(sys.argv) != 2:
        print(json.dumps({"error": "Usage: python openclip_embeddings.py <image_path_or_base64>"}))
        sys.exit(1)
    
    embedder = OpenCLIPEmbedder()
    result = embedder.generate_embedding(sys.argv[1])
    print(json.dumps(result))

if __name__ == "__main__":
    main()