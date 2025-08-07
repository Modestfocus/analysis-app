import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Wallet, User, TrendingUp, BarChart3 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import ThemeToggle from "@/components/ThemeToggle";

// Background images array for rotation - using relative paths to avoid import issues with special characters
const backgroundImages = [
  "/attached_assets/silhouette-two-male-hikers-climbing-600nw-1866436603_1754174187596.webp",
  "/attached_assets/rowing-bg2_1754174196782.png",
  "/attached_assets/Perte-de-motivation-sportive_prevention-et-solutions-1_1754174204304.jpg",
  "/attached_assets/man-7834594_640_1754174210314.jpg",
  "/attached_assets/Lee_Barnes,_champion_olympique_du_saut_à_la_perche_en_1924_1754174220715.jpg",
  "/attached_assets/KellyFallon1_1754174230720.jpg",
  "/attached_assets/istockphoto-2060317185-612x612_1754174239238.jpg",
  "/attached_assets/istockphoto-1483065861-612x612_1754174248870.jpg",
  "/attached_assets/istockphoto-644503898-612x612_1754174266181.jpg",
  "/attached_assets/istockphoto-1370663803-612x612_1754174276784.jpg"
];

export default function HomeAuthPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  
  // Background rotation state
  const [currentBackgroundIndex, setCurrentBackgroundIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  
  // Traditional login state
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  
  // Wallet connection state
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");

  // Background rotation effect
  useEffect(() => {
    const getRandomInterval = () => Math.random() * 3000 + 4000; // Random interval between 4-7 seconds
    
    const rotateBackground = () => {
      setIsTransitioning(true);
      
      setTimeout(() => {
        setCurrentBackgroundIndex(prevIndex => {
          let newIndex;
          do {
            newIndex = Math.floor(Math.random() * backgroundImages.length);
          } while (newIndex === prevIndex && backgroundImages.length > 1); // Ensure we don't repeat the same image
          return newIndex;
        });
        setIsTransitioning(false);
      }, 500); // Transition duration
    };

    const scheduleNextRotation = () => {
      const timeoutId = setTimeout(() => {
        rotateBackground();
        scheduleNextRotation();
      }, getRandomInterval());
      return timeoutId;
    };

    const timeoutId = scheduleNextRotation();

    return () => clearTimeout(timeoutId);
  }, []);

  const handleTraditionalAuth = async () => {
    setIsLoading(true);
    try {
      const endpoint = isRegisterMode ? "/api/auth/register" : "/api/auth/login";
      const payload = isRegisterMode 
        ? { username, password, email: email || undefined }
        : { username, password };

      const response = await apiRequest("POST", endpoint, payload);
      const data = await response.json();

      if (data.success) {
        toast({
          title: isRegisterMode ? "Registration successful" : "Login successful",
          description: `Welcome ${data.user.username}!`,
        });
        setLocation("/dashboard");
      } else {
        throw new Error(data.error || "Authentication failed");
      }
    } catch (error: any) {
      toast({
        title: "Authentication failed",
        description: error.message || "Please check your credentials",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const connectPhantom = async () => {
    setIsLoading(true);
    try {
      // Check if Phantom wallet is installed
      const { solana } = window as any;
      
      if (!solana) {
        toast({
          title: "Phantom Wallet not found",
          description: "Please install Phantom Wallet to continue",
          variant: "destructive",
        });
        window.open("https://phantom.app/", "_blank");
        return;
      }

      if (!solana.isPhantom) {
        toast({
          title: "Phantom Wallet not detected",
          description: "Please make sure Phantom is properly installed",
          variant: "destructive",
        });
        return;
      }

      // Request connection to Phantom
      console.log("Requesting connection to Phantom wallet...");
      const response = await solana.connect({ onlyIfTrusted: false });
      
      if (!response || !response.publicKey) {
        throw new Error("Failed to connect to Phantom wallet");
      }

      const walletAddr = response.publicKey.toString();
      console.log("Connected to wallet:", walletAddr);
      
      setWalletAddress(walletAddr);
      setWalletConnected(true);

      // Authenticate with backend
      console.log("Authenticating with backend...");
      const authResponse = await apiRequest("POST", "/api/auth/wallet-login", {
        walletAddress: walletAddr,
        walletType: "phantom"
      });
      
      if (!authResponse.ok) {
        const errorText = await authResponse.text();
        console.error("Backend authentication failed:", errorText);
        throw new Error(`Authentication failed: ${authResponse.status}`);
      }

      const data = await authResponse.json();
      console.log("Backend response:", data);

      if (data.success) {
        toast({
          title: "Wallet connected successfully",
          description: `Connected to ${walletAddr.slice(0, 8)}...${walletAddr.slice(-8)}`,
        });
        setLocation("/dashboard");
      } else {
        throw new Error(data.error || "Wallet authentication failed");
      }
    } catch (error: any) {
      console.error("Phantom connection error:", error);
      toast({
        title: "Connection failed",
        description: error.message || "Failed to connect wallet",
        variant: "destructive",
      });
      setWalletConnected(false);
      setWalletAddress("");
    } finally {
      setIsLoading(false);
    }
  };

  const connectMetaMask = async () => {
    setIsLoading(true);
    try {
      // Check if MetaMask is installed
      const { ethereum } = window as any;
      
      if (ethereum && ethereum.isMetaMask) {
        // Connect to MetaMask
        const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
        const walletAddr = accounts[0];
        setWalletAddress(walletAddr);
        setWalletConnected(true);

        // Authenticate with backend
        const authResponse = await apiRequest("POST", "/api/auth/wallet-login", {
          walletAddress: walletAddr,
          walletType: "metamask"
        });
        const data = await authResponse.json();

        if (data.success) {
          toast({
            title: "Wallet connected successfully",
            description: `Connected to ${walletAddr.slice(0, 8)}...${walletAddr.slice(-8)}`,
          });
          setLocation("/dashboard");
        } else {
          throw new Error(data.error || "Wallet authentication failed");
        }
      } else {
        toast({
          title: "MetaMask not found",
          description: "Please install MetaMask to continue",
          variant: "destructive",
        });
        // Open MetaMask website
        window.open("https://metamask.io/", "_blank");
      }
    } catch (error: any) {
      toast({
        title: "Connection failed",
        description: error.message || "Failed to connect wallet",
        variant: "destructive",
      });
      setWalletConnected(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden dark:bg-gray-900">
      {/* Theme Toggle - Fixed position */}
      <div className="absolute top-6 right-6 z-20">
        <ThemeToggle />
      </div>
      
      {/* Background Image with Overlay */}
      <div 
        className={`absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-500 ${
          isTransitioning ? 'opacity-50' : 'opacity-100'
        } dark:opacity-30`}
        style={{
          backgroundImage: `url(${backgroundImages[currentBackgroundIndex]})`
        }}
      />
      {/* Dark overlay for better content readability */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900/85 via-purple-900/75 to-slate-900/85 dark:from-gray-900/95 dark:via-gray-800/90 dark:to-gray-900/95" />
      
      {/* Content */}
      <div className="relative z-10 min-h-screen bg-transparent">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-left mb-16 max-w-4xl">
          <h1 className="text-6xl md:text-7xl font-bold text-white mb-6 leading-tight">
            Analyze first /<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">
              Then trade.
            </span>
          </h1>
          <p className="text-xl text-slate-300 max-w-xl leading-relaxed">
            The best trades require deep analysis, then confident execution.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-12 items-start">
          {/* Left side - Features */}
          <div className="lg:col-span-2 space-y-8">
            <div className="flex items-start space-x-4">
              <div className="bg-purple-500/20 p-3 rounded-lg">
                <TrendingUp className="h-6 w-6 text-purple-400" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white mb-2">Advanced AI Analysis</h3>
                <p className="text-slate-300">
                  GPT-4o powered chart analysis with depth maps, edge detection, and pattern recognition
                </p>
              </div>
            </div>
            
            <div className="flex items-start space-x-4">
              <div className="bg-blue-500/20 p-3 rounded-lg">
                <BarChart3 className="h-6 w-6 text-blue-400" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white mb-2">Multi-Timeframe Analysis</h3>
                <p className="text-slate-300">
                  Bundle charts across different timeframes for comprehensive market insights
                </p>
              </div>
            </div>
            
            <div className="flex items-start space-x-4">
              <div className="bg-green-500/20 p-3 rounded-lg">
                <Wallet className="h-6 w-6 text-green-400" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white mb-2">Web3 Integration</h3>
                <p className="text-slate-300">
                  Connect with Phantom or MetaMask wallets for seamless authentication
                </p>
              </div>
            </div>
          </div>

          {/* Right side - Authentication */}
          <div className="w-full max-w-xs mx-auto lg:mx-0">
            <Card className="bg-white/10 backdrop-blur-md border-white/20">
              <CardHeader className="text-center pb-4">
                <CardTitle className="text-white text-lg">Welcome Back</CardTitle>
                <CardDescription className="text-slate-300 text-sm">
                  Sign in to start analyzing
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <Tabs defaultValue="traditional" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 mb-4 h-8">
                    <TabsTrigger value="traditional" className="flex items-center gap-1 text-xs">
                      <User className="h-3 w-3" />
                      Login
                    </TabsTrigger>
                    <TabsTrigger value="wallet" className="flex items-center gap-1 text-xs">
                      <Wallet className="h-3 w-3" />
                      Wallet
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="traditional" className="space-y-3">
                    <div className="space-y-2">
                      <div>
                        <Label htmlFor="username" className="text-white text-xs">Username</Label>
                        <Input
                          id="username"
                          type="text"
                          placeholder="Username"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          className="bg-white/10 border-white/20 text-white placeholder-slate-400 h-8 text-sm"
                        />
                      </div>
                      
                      <div>
                        <Label htmlFor="password" className="text-white text-xs">Password</Label>
                        <Input
                          id="password"
                          type="password"
                          placeholder="Password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="bg-white/10 border-white/20 text-white placeholder-slate-400 h-8 text-sm"
                        />
                      </div>

                      {isRegisterMode && (
                        <div>
                          <Label htmlFor="email" className="text-white text-xs">Email (optional)</Label>
                          <Input
                            id="email"
                            type="email"
                            placeholder="Email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="bg-white/10 border-white/20 text-white placeholder-slate-400 h-8 text-sm"
                          />
                        </div>
                      )}
                    </div>

                    <Button 
                      onClick={handleTraditionalAuth}
                      disabled={isLoading || !username || !password}
                      className="w-full bg-purple-600 hover:bg-purple-700 h-8 text-sm"
                    >
                      {isLoading ? "Processing..." : (isRegisterMode ? "Register" : "Sign In")}
                    </Button>

                    <div className="text-center">
                      <button
                        onClick={() => setIsRegisterMode(!isRegisterMode)}
                        className="text-purple-400 hover:text-purple-300 text-xs"
                      >
                        {isRegisterMode ? "Sign in instead" : "Create account"}
                      </button>
                    </div>
                  </TabsContent>

                  <TabsContent value="wallet" className="space-y-3">
                    <div className="space-y-2">
                      <Button
                        onClick={connectPhantom}
                        disabled={isLoading}
                        className="w-full bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 h-8 text-sm"
                      >
                        <Wallet className="mr-1 h-3 w-3" />
                        {isLoading ? "Connecting..." : "Phantom"}
                      </Button>

                      <Button
                        onClick={connectMetaMask}
                        disabled={isLoading}
                        variant="outline"
                        className="w-full border-orange-500/50 text-orange-400 hover:bg-orange-500/10 h-8 text-sm"
                      >
                        <Wallet className="mr-1 h-3 w-3" />
                        {isLoading ? "Connecting..." : "MetaMask"}
                      </Button>
                    </div>

                    <div className="text-xs text-slate-400 text-center">
                      Secure wallet authentication
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-16 text-slate-400">
          <p>Powered by GPT-4o Vision, CLIP, and Advanced Image Processing</p>
        </div>
      </div>
      </div>
    </div>
  );
}