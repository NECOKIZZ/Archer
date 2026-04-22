import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { ethers } from 'ethers';

// Arc Testnet chain ID
const ARC_TESTNET_CHAIN_ID = '0x4cef52'; // 5042002

export const useWallet = () => {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [balance, setBalance] = useState(0);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);

  const isMetaMaskAvailable = typeof window !== 'undefined' && Boolean((window as any).ethereum);

  // Switch or add Arc Testnet network
  const switchToArcTestnet = async () => {
    const eth = (window as any).ethereum;
    try {
      await eth.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: ARC_TESTNET_CHAIN_ID }],
      });
    } catch (err: any) {
      // Chain not added yet — add it
      if (err.code === 4902) {
        await eth.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: ARC_TESTNET_CHAIN_ID,
              chainName: 'Arc Testnet',
              nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
              rpcUrls: ['https://rpc.testnet.arc.network'],
            },
          ],
        });
      } else {
        throw err;
      }
    }
  };

  // Fetch and update balance reliably
  const updateBalance = async (ethObject: any, account: string) => {
    try {
      const p = new ethers.BrowserProvider(ethObject);
      setProvider(p);
      const bal = await p.getBalance(account);
      setBalance(Number(ethers.formatEther(bal)));
    } catch (err) {
      console.error("Failed to update balance:", err);
    }
  };

  // Listen for account and chain changes
  useEffect(() => {
    if (!isMetaMaskAvailable) return;
    const eth = (window as any).ethereum;

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        setAddress(null);
        setChainId(null);
      } else {
        setAddress(accounts[0]);
        updateBalance(eth, accounts[0]);
      }
    };

    const handleChainChanged = async (id: string) => {
      setChainId(id);
      try {
        const accounts = await eth.request({ method: 'eth_accounts' });
        if (accounts && accounts.length > 0) {
          setTimeout(() => updateBalance(eth, accounts[0]), 500);
        }
      } catch(e) {}
    };

    eth.on('accountsChanged', handleAccountsChanged);
    eth.on('chainChanged', handleChainChanged);

    // Restore session if already connected
    eth.request({ method: 'eth_accounts' }).then(async (accounts: string[]) => {
      if (accounts.length > 0) {
        setAddress(accounts[0]);
        const id = await eth.request({ method: 'eth_chainId' });
        setChainId(id);
        updateBalance(eth, accounts[0]);
      }
    });

    return () => {
      eth.removeListener('accountsChanged', handleAccountsChanged);
      eth.removeListener('chainChanged', handleChainChanged);
    };
  }, [isMetaMaskAvailable]);

  const connect = useCallback(async () => {
    if (!isMetaMaskAvailable) {
      toast.error('MetaMask not detected', {
        description: 'Please install MetaMask to play.',
      });
      return;
    }
    const eth = (window as any).ethereum;
    try {
      const accounts: string[] = await eth.request({ method: 'eth_requestAccounts' });
      await switchToArcTestnet();
      const id: string = await eth.request({ method: 'eth_chainId' });
      setAddress(accounts[0]);
      setChainId(id);
      
      await updateBalance(eth, accounts[0]);

      toast.success('Wallet connected', {
        description: `${accounts[0].slice(0, 6)}...${accounts[0].slice(-4)} on Arc Testnet`,
      });
    } catch (err: any) {
      toast.error('Connection failed', { description: err?.message ?? 'Unknown error' });
    }
  }, [isMetaMaskAvailable]);

  const disconnect = useCallback(() => {
    setAddress(null);
    setChainId(null);
    setBalance(0);
    setProvider(null);
    toast('Wallet disconnected');
  }, []);

  const isOnArcTestnet = chainId === ARC_TESTNET_CHAIN_ID;

  return { address, balance, chainId, isOnArcTestnet, connect, disconnect, provider, isMetaMaskAvailable };
};
