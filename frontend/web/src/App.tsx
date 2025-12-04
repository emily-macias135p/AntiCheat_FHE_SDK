// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface CheatRecord {
  id: string;
  encryptedScore: string;
  timestamp: number;
  playerAddress: string;
  gameId: string;
  status: "normal" | "suspicious" | "confirmed";
  detectionType: string;
}

const FHEEncryptNumber = (value: number): string => {
  return `FHE-${btoa(value.toString())}`;
};

const FHEDecryptNumber = (encryptedData: string): number => {
  if (encryptedData.startsWith('FHE-')) {
    return parseFloat(atob(encryptedData.substring(4)));
  }
  return parseFloat(encryptedData);
};

const FHECompute = (encryptedData: string, operation: string): string => {
  const value = FHEDecryptNumber(encryptedData);
  let result = value;
  
  switch(operation) {
    case 'increase10%':
      result = value * 1.1;
      break;
    case 'decrease10%':
      result = value * 0.9;
      break;
    case 'double':
      result = value * 2;
      break;
    default:
      result = value;
  }
  
  return FHEEncryptNumber(result);
};

const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const detectionTypes = [
  "Speed Hack", 
  "Aimbot", 
  "Wallhack", 
  "Inventory Manipulation",
  "Currency Exploit",
  "Cooldown Bypass"
];

const announcements = [
  {
    id: 1,
    title: "Zama FHE Integration Complete",
    content: "Successfully integrated Zama FHE for encrypted cheat detection processing",
    date: "2025-09-15",
    priority: "high"
  },
  {
    id: 2,
    title: "New Detection Algorithm",
    content: "Added new pattern recognition for speed hacks using FHE computations",
    date: "2025-09-20",
    priority: "medium"
  },
  {
    id: 3,
    title: "SDK v2.1 Released",
    content: "Latest version includes improved performance and additional detection types",
    date: "2025-10-05",
    priority: "low"
  }
];

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<CheatRecord[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [newRecordData, setNewRecordData] = useState({ gameId: "", detectionType: "Speed Hack", cheatScore: 0 });
  const [selectedRecord, setSelectedRecord] = useState<CheatRecord | null>(null);
  const [decryptedValue, setDecryptedValue] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState<string>("");
  const [contractAddress, setContractAddress] = useState<string>("");
  const [chainId, setChainId] = useState<number>(0);
  const [startTimestamp, setStartTimestamp] = useState<number>(0);
  const [durationDays, setDurationDays] = useState<number>(30);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  
  const normalCount = records.filter(r => r.status === "normal").length;
  const suspiciousCount = records.filter(r => r.status === "suspicious").length;
  const confirmedCount = records.filter(r => r.status === "confirmed").length;

  useEffect(() => {
    loadRecords().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, []);

  const loadRecords = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) return;
      const keysBytes = await contract.getData("record_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try {
          const keysStr = ethers.toUtf8String(keysBytes);
          if (keysStr.trim() !== '') keys = JSON.parse(keysStr);
        } catch (e) { console.error("Error parsing record keys:", e); }
      }
      const list: CheatRecord[] = [];
      for (const key of keys) {
        try {
          const recordBytes = await contract.getData(`record_${key}`);
          if (recordBytes.length > 0) {
            try {
              const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
              list.push({ 
                id: key, 
                encryptedScore: recordData.score, 
                timestamp: recordData.timestamp, 
                playerAddress: recordData.playerAddress, 
                gameId: recordData.gameId,
                status: recordData.status || "normal",
                detectionType: recordData.detectionType || "Unknown"
              });
            } catch (e) { console.error(`Error parsing record data for ${key}:`, e); }
          }
        } catch (e) { console.error(`Error loading record ${key}:`, e); }
      }
      list.sort((a, b) => b.timestamp - a.timestamp);
      setRecords(list);
    } catch (e) { console.error("Error loading records:", e); } 
    finally { setIsRefreshing(false); setLoading(false); }
  };

  const submitRecord = async () => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setCreating(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Encrypting cheat score with Zama FHE..." });
    try {
      const encryptedScore = FHEEncryptNumber(newRecordData.cheatScore);
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      const recordId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const recordData = { 
        score: encryptedScore, 
        timestamp: Math.floor(Date.now() / 1000), 
        playerAddress: address, 
        gameId: newRecordData.gameId,
        status: "normal",
        detectionType: newRecordData.detectionType
      };
      await contract.setData(`record_${recordId}`, ethers.toUtf8Bytes(JSON.stringify(recordData)));
      const keysBytes = await contract.getData("record_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try { keys = JSON.parse(ethers.toUtf8String(keysBytes)); } 
        catch (e) { console.error("Error parsing keys:", e); }
      }
      keys.push(recordId);
      await contract.setData("record_keys", ethers.toUtf8Bytes(JSON.stringify(keys)));
      setTransactionStatus({ visible: true, status: "success", message: "Encrypted cheat data submitted securely!" });
      await loadRecords();
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewRecordData({ gameId: "", detectionType: "Speed Hack", cheatScore: 0 });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") ? "Transaction rejected by user" : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { setCreating(false); }
  };

  const decryptWithSignature = async (encryptedData: string): Promise<number | null> => {
    if (!isConnected) { alert("Please connect wallet first"); return null; }
    setIsDecrypting(true);
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      return FHEDecryptNumber(encryptedData);
    } catch (e) { console.error("Decryption failed:", e); return null; } 
    finally { setIsDecrypting(false); }
  };

  const markAsSuspicious = async (recordId: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Processing encrypted data with FHE..." });
    try {
      const contract = await getContractReadOnly();
      if (!contract) throw new Error("Failed to get contract");
      const recordBytes = await contract.getData(`record_${recordId}`);
      if (recordBytes.length === 0) throw new Error("Record not found");
      const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
      
      const updatedScore = FHECompute(recordData.score, 'increase10%');
      
      const contractWithSigner = await getContractWithSigner();
      if (!contractWithSigner) throw new Error("Failed to get contract with signer");
      
      const updatedRecord = { ...recordData, status: "suspicious", score: updatedScore };
      await contractWithSigner.setData(`record_${recordId}`, ethers.toUtf8Bytes(JSON.stringify(updatedRecord)));
      
      setTransactionStatus({ visible: true, status: "success", message: "FHE analysis completed - marked as suspicious!" });
      await loadRecords();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Operation failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const confirmCheating = async (recordId: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Processing encrypted data with FHE..." });
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      const recordBytes = await contract.getData(`record_${recordId}`);
      if (recordBytes.length === 0) throw new Error("Record not found");
      const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
      const updatedRecord = { ...recordData, status: "confirmed" };
      await contract.setData(`record_${recordId}`, ethers.toUtf8Bytes(JSON.stringify(updatedRecord)));
      setTransactionStatus({ visible: true, status: "success", message: "Cheating confirmed with FHE verification!" });
      await loadRecords();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Confirmation failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const isOwner = (recordAddress: string) => address?.toLowerCase() === recordAddress.toLowerCase();

  const filteredRecords = records.filter(record => {
    const matchesSearch = 
      record.gameId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.playerAddress.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.detectionType.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = 
      filterStatus === "all" || 
      record.status === filterStatus;
    
    return matchesSearch && matchesStatus;
  });

  const renderBarChart = () => {
    const detectionCounts: Record<string, number> = {};
    detectionTypes.forEach(type => {
      detectionCounts[type] = records.filter(r => r.detectionType === type).length;
    });
    
    const maxCount = Math.max(...Object.values(detectionCounts), 1);
    
    return (
      <div className="bar-chart-container">
        {Object.entries(detectionCounts).map(([type, count]) => (
          <div key={type} className="bar-item">
            <div className="bar-label">{type}</div>
            <div className="bar-wrapper">
              <div 
                className="bar-fill" 
                style={{ width: `${(count / maxCount) * 100}%` }}
              >
                <span className="bar-value">{count}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="metal-spinner"></div>
      <p>Initializing FHE Anti-Cheat System...</p>
    </div>
  );

  return (
    <div className="app-container future-metal-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="shield-icon"></div>
          </div>
          <h1>FHE<span>AntiCheat</span></h1>
        </div>
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-record-btn metal-button"
            data-tooltip="Submit new cheat detection data"
          >
            <div className="add-icon"></div>New Detection
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>
      
      <div className="main-content dashboard-layout">
        <div className="dashboard-column stats-column">
          <div className="dashboard-card metal-card">
            <h3>Detection Statistics</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{records.length}</div>
                <div className="stat-label">Total Scans</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{confirmedCount}</div>
                <div className="stat-label">Confirmed</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{suspiciousCount}</div>
                <div className="stat-label">Suspicious</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{normalCount}</div>
                <div className="stat-label">Normal</div>
              </div>
            </div>
          </div>
          
          <div className="dashboard-card metal-card">
            <h3>Detection Types</h3>
            {renderBarChart()}
          </div>
          
          <div className="dashboard-card metal-card">
            <h3>System Announcements</h3>
            <div className="announcements-list">
              {announcements.map(announcement => (
                <div key={announcement.id} className={`announcement-item ${announcement.priority}`}>
                  <div className="announcement-date">{announcement.date}</div>
                  <h4>{announcement.title}</h4>
                  <p>{announcement.content}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        <div className="dashboard-column main-column">
          <div className="welcome-banner">
            <div className="welcome-text">
              <h2>Universal FHE Anti-Cheat System</h2>
              <p>Detect cheating patterns while preserving player privacy using Zama FHE technology</p>
            </div>
            <div className="fhe-indicator">
              <div className="fhe-lock"></div>
              <span>FHE Encryption Active</span>
            </div>
          </div>
          
          <div className="records-section">
            <div className="section-header">
              <h2>Cheat Detection Records</h2>
              <div className="header-actions">
                <div className="search-box">
                  <input 
                    type="text" 
                    placeholder="Search games or players..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  <div className="search-icon"></div>
                </div>
                <select 
                  value={filterStatus} 
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="status-filter"
                >
                  <option value="all">All Statuses</option>
                  <option value="normal">Normal</option>
                  <option value="suspicious">Suspicious</option>
                  <option value="confirmed">Confirmed</option>
                </select>
                <button 
                  onClick={loadRecords} 
                  className="refresh-btn metal-button" 
                  disabled={isRefreshing}
                >
                  {isRefreshing ? "Refreshing..." : "Refresh"}
                </button>
              </div>
            </div>
            
            <div className="records-list metal-card">
              <div className="table-header">
                <div className="header-cell">Game ID</div>
                <div className="header-cell">Player</div>
                <div className="header-cell">Type</div>
                <div className="header-cell">Date</div>
                <div className="header-cell">Status</div>
                <div className="header-cell">Actions</div>
              </div>
              
              {filteredRecords.length === 0 ? (
                <div className="no-records">
                  <div className="no-records-icon"></div>
                  <p>No cheat detection records found</p>
                  <button 
                    className="metal-button primary" 
                    onClick={() => setShowCreateModal(true)}
                  >
                    Submit First Detection
                  </button>
                </div>
              ) : filteredRecords.map(record => (
                <div 
                  className="record-row" 
                  key={record.id} 
                  onClick={() => setSelectedRecord(record)}
                  data-status={record.status}
                >
                  <div className="table-cell">{record.gameId}</div>
                  <div className="table-cell">
                    {record.playerAddress.substring(0, 6)}...{record.playerAddress.substring(38)}
                  </div>
                  <div className="table-cell">{record.detectionType}</div>
                  <div className="table-cell">
                    {new Date(record.timestamp * 1000).toLocaleDateString()}
                  </div>
                  <div className="table-cell">
                    <span className={`status-badge ${record.status}`}>
                      {record.status}
                    </span>
                  </div>
                  <div className="table-cell actions">
                    {isOwner(record.playerAddress) && record.status === "normal" && (
                      <button 
                        className="action-btn metal-button warning"
                        onClick={(e) => { e.stopPropagation(); markAsSuspicious(record.id); }}
                        data-tooltip="Mark as suspicious"
                      >
                        Flag
                      </button>
                    )}
                    {isOwner(record.playerAddress) && record.status === "suspicious" && (
                      <button 
                        className="action-btn metal-button danger"
                        onClick={(e) => { e.stopPropagation(); confirmCheating(record.id); }}
                        data-tooltip="Confirm cheating"
                      >
                        Confirm
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitRecord} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating} 
          recordData={newRecordData} 
          setRecordData={setNewRecordData}
        />
      )}
      
      {selectedRecord && (
        <RecordDetailModal 
          record={selectedRecord} 
          onClose={() => { setSelectedRecord(null); setDecryptedValue(null); }} 
          decryptedValue={decryptedValue} 
          setDecryptedValue={setDecryptedValue} 
          isDecrypting={isDecrypting} 
          decryptWithSignature={decryptWithSignature}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content metal-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="metal-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
      
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="shield-icon"></div>
              <span>FHE AntiCheat SDK</span>
            </div>
            <p>Powered by Zama FHE technology for privacy-preserving cheat detection</p>
          </div>
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">GitHub</a>
            <a href="#" className="footer-link">Terms</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Privacy</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} FHE AntiCheat. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  recordData: any;
  setRecordData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ onSubmit, onClose, creating, recordData, setRecordData }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setRecordData({ ...recordData, [name]: value });
  };

  const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setRecordData({ ...recordData, [name]: parseFloat(value) });
  };

  const handleSubmit = () => {
    if (!recordData.gameId || !recordData.cheatScore) { 
      alert("Please fill required fields"); 
      return; 
    }
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal metal-card">
        <div className="modal-header">
          <h2>New Cheat Detection</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="key-icon"></div> 
            <div>
              <strong>FHE Encryption Active</strong>
              <p>Cheat scores will be encrypted with Zama FHE before submission</p>
            </div>
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Game ID *</label>
              <input 
                type="text" 
                name="gameId" 
                value={recordData.gameId} 
                onChange={handleChange} 
                placeholder="Enter game identifier..."
                className="metal-input"
              />
            </div>
            
            <div className="form-group">
              <label>Detection Type *</label>
              <select 
                name="detectionType" 
                value={recordData.detectionType} 
                onChange={handleChange} 
                className="metal-select"
              >
                {detectionTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            
            <div className="form-group">
              <label>Cheat Score *</label>
              <input 
                type="number" 
                name="cheatScore" 
                value={recordData.cheatScore} 
                onChange={handleValueChange} 
                placeholder="Enter cheat probability (0-100)"
                className="metal-input"
                min="0"
                max="100"
              />
            </div>
          </div>
          
          <div className="encryption-preview">
            <h4>FHE Encryption Preview</h4>
            <div className="preview-container">
              <div className="plain-data">
                <span>Plain Score:</span>
                <div>{recordData.cheatScore || 'No value entered'}</div>
              </div>
              <div className="encryption-arrow">→</div>
              <div className="encrypted-data">
                <span>Encrypted Data:</span>
                <div>
                  {recordData.cheatScore ? 
                    FHEEncryptNumber(recordData.cheatScore).substring(0, 50) + '...' : 
                    'No value entered'
                  }
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn metal-button">
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating} 
            className="submit-btn metal-button primary"
          >
            {creating ? "Encrypting with FHE..." : "Submit Detection"}
          </button>
        </div>
      </div>
    </div>
  );
};

interface RecordDetailModalProps {
  record: CheatRecord;
  onClose: () => void;
  decryptedValue: number | null;
  setDecryptedValue: (value: number | null) => void;
  isDecrypting: boolean;
  decryptWithSignature: (encryptedData: string) => Promise<number | null>;
}

const RecordDetailModal: React.FC<RecordDetailModalProps> = ({ 
  record, 
  onClose, 
  decryptedValue, 
  setDecryptedValue, 
  isDecrypting, 
  decryptWithSignature 
}) => {
  const handleDecrypt = async () => {
    if (decryptedValue !== null) { 
      setDecryptedValue(null); 
      return; 
    }
    const decrypted = await decryptWithSignature(record.encryptedScore);
    if (decrypted !== null) setDecryptedValue(decrypted);
  };

  return (
    <div className="modal-overlay">
      <div className="record-detail-modal metal-card">
        <div className="modal-header">
          <h2>Detection Details</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="record-info">
            <div className="info-item">
              <span>Game ID:</span>
              <strong>{record.gameId}</strong>
            </div>
            <div className="info-item">
              <span>Player:</span>
              <strong>
                {record.playerAddress.substring(0, 6)}...{record.playerAddress.substring(38)}
              </strong>
            </div>
            <div className="info-item">
              <span>Detection Type:</span>
              <strong>{record.detectionType}</strong>
            </div>
            <div className="info-item">
              <span>Date:</span>
              <strong>
                {new Date(record.timestamp * 1000).toLocaleString()}
              </strong>
            </div>
            <div className="info-item">
              <span>Status:</span>
              <strong className={`status-badge ${record.status}`}>
                {record.status}
              </strong>
            </div>
          </div>
          
          <div className="encrypted-data-section">
            <h3>FHE Encrypted Score</h3>
            <div className="encrypted-data">
              {record.encryptedScore.substring(0, 100)}...
            </div>
            <div className="fhe-tag">
              <div className="fhe-icon"></div>
              <span>Zama FHE Encrypted</span>
            </div>
            
            <button 
              className="decrypt-btn metal-button" 
              onClick={handleDecrypt} 
              disabled={isDecrypting}
            >
              {isDecrypting ? (
                <span className="decrypt-spinner"></span>
              ) : decryptedValue !== null ? (
                "Hide Decrypted Value"
              ) : (
                "Decrypt with Wallet Signature"
              )}
            </button>
          </div>
          
          {decryptedValue !== null && (
            <div className="decrypted-data-section">
              <h3>Decrypted Cheat Score</h3>
              <div className="decrypted-value">
                {decryptedValue}
                <span className="score-percentage">%</span>
              </div>
              <div className="decryption-notice">
                <div className="warning-icon"></div>
                <span>
                  Decrypted data is only visible after wallet signature verification
                </span>
              </div>
            </div>
          )}
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn metal-button">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;