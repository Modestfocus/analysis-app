import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Wallet, User, TrendingUp, BarChart3 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function HomeAuthPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  
  // Traditional login state
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  
  // Wallet connection state
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");

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
      
      if (solana && solana.isPhantom) {
        // Connect to Phantom
        const response = await solana.connect();
        const walletAddr = response.publicKey.toString();
        setWalletAddress(walletAddr);
        setWalletConnected(true);

        // Authenticate with backend
        const authResponse = await apiRequest("POST", "/api/auth/wallet-login", {
          walletAddress: walletAddr,
          walletType: "phantom"
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
          title: "Phantom Wallet not found",
          description: "Please install Phantom Wallet to continue",
          variant: "destructive",
        });
        // Open Phantom website
        window.open("https://phantom.app/", "_blank");
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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-white mb-4">
            Chart<span className="text-purple-400">Analysis</span>
          </h1>
          <p className="text-xl text-slate-300 max-w-2xl mx-auto">
            AI-powered trading chart analysis with advanced pattern recognition and visual intelligence
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left side - Features */}
          <div className="space-y-8">
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
          <div className="w-full max-w-md mx-auto">
            <Card className="bg-white/10 backdrop-blur-md border-white/20">
              <CardHeader className="text-center">
                <CardTitle className="text-white">Welcome Back</CardTitle>
                <CardDescription className="text-slate-300">
                  Sign in to access your chart analysis dashboard
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="traditional" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 mb-6">
                    <TabsTrigger value="traditional" className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Traditional
                    </TabsTrigger>
                    <TabsTrigger value="wallet" className="flex items-center gap-2">
                      <Wallet className="h-4 w-4" />
                      Wallet
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="traditional" className="space-y-4">
                    <div className="space-y-3">
                      <div>
                        <Label htmlFor="username" className="text-white">Username</Label>
                        <Input
                          id="username"
                          type="text"
                          placeholder="Enter your username"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          className="bg-white/10 border-white/20 text-white placeholder-slate-400"
                        />
                      </div>
                      
                      <div>
                        <Label htmlFor="password" className="text-white">Password</Label>
                        <Input
                          id="password"
                          type="password"
                          placeholder="Enter your password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="bg-white/10 border-white/20 text-white placeholder-slate-400"
                        />
                      </div>

                      {isRegisterMode && (
                        <div>
                          <Label htmlFor="email" className="text-white">Email (optional)</Label>
                          <Input
                            id="email"
                            type="email"
                            placeholder="Enter your email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="bg-white/10 border-white/20 text-white placeholder-slate-400"
                          />
                        </div>
                      )}
                    </div>

                    <Button 
                      onClick={handleTraditionalAuth}
                      disabled={isLoading || !username || !password}
                      className="w-full bg-purple-600 hover:bg-purple-700"
                    >
                      {isLoading ? "Processing..." : (isRegisterMode ? "Register" : "Sign In")}
                    </Button>

                    <div className="text-center">
                      <button
                        onClick={() => setIsRegisterMode(!isRegisterMode)}
                        className="text-purple-400 hover:text-purple-300 text-sm"
                      >
                        {isRegisterMode ? "Already have an account? Sign in" : "Need an account? Register"}
                      </button>
                    </div>
                  </TabsContent>

                  <TabsContent value="wallet" className="space-y-4">
                    <div className="space-y-3">
                      <Button
                        onClick={connectPhantom}
                        disabled={isLoading}
                        className="w-full bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800"
                      >
                        <Wallet className="mr-2 h-4 w-4" />
                        {isLoading ? "Connecting..." : "Connect Phantom Wallet"}
                      </Button>

                      <Button
                        onClick={connectMetaMask}
                        disabled={isLoading}
                        variant="outline"
                        className="w-full border-orange-500/50 text-orange-400 hover:bg-orange-500/10"
                      >
                        <Wallet className="mr-2 h-4 w-4" />
                        {isLoading ? "Connecting..." : "Connect MetaMask"}
                      </Button>
                    </div>

                    <div className="text-xs text-slate-400 text-center">
                      Connect your crypto wallet for secure, decentralized authentication
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
  );
}