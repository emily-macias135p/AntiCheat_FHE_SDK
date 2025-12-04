pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";


contract AntiCheatFHE is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    address public owner;
    mapping(address => bool) public providers;
    bool public paused;
    uint256 public cooldownSeconds;
    mapping(address => uint256) public lastSubmissionTime;
    mapping(address => uint256) public lastDecryptionRequestTime;

    uint256 public currentBatchId;
    mapping(uint256 => bool) public batchClosed;

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }
    mapping(uint256 => DecryptionContext) public decryptionContexts;

    // Encrypted player data storage
    struct PlayerData {
        euint32 inputSequenceHash; // Encrypted hash of player input sequence
        euint32 memoryPatternHash; // Encrypted hash of critical memory patterns
        euint32 score;             // Encrypted player score
        euint32 timestamp;         // Encrypted timestamp of data submission
    }
    mapping(uint256 => mapping(address => PlayerData)) public batchPlayerData;
    mapping(uint256 => address[]) public batchPlayers;

    // Analysis results storage (encrypted)
    struct AnalysisResult {
        euint32 batchId;
        euint32 cheatScore;
        ebool isCheatDetected;
    }
    mapping(uint256 => AnalysisResult) public batchAnalysisResults;


    // Events
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event PauseToggled(bool paused);
    event CooldownSet(uint256 oldCooldownSeconds, uint256 newCooldownSeconds);
    event BatchOpened(uint256 batchId);
    event BatchClosed(uint256 batchId);
    event PlayerDataSubmitted(address indexed player, uint256 batchId);
    event AnalysisRequested(uint256 requestId, uint256 batchId);
    event AnalysisComplete(uint256 requestId, uint256 batchId, uint256 cheatScore, bool isCheatDetected);

    // Custom Errors
    error NotOwner();
    error NotProvider();
    error Paused();
    error CooldownActive();
    error BatchClosedOrInvalid();
    error ReplayAttempt();
    error StateMismatch();
    error InvalidProof();
    error NotInitialized();
    error InvalidBatchId();
    error InvalidCooldown();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!providers[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    constructor() {
        owner = msg.sender;
        _initIfNeeded();
    }

    function transferOwnership(address newOwner) external onlyOwner {
        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    function addProvider(address provider) external onlyOwner {
        providers[provider] = true;
        emit ProviderAdded(provider);
    }

    function removeProvider(address provider) external onlyOwner {
        providers[provider] = false;
        emit ProviderRemoved(provider);
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit PauseToggled(_paused);
    }

    function setCooldown(uint256 _cooldownSeconds) external onlyOwner {
        if (_cooldownSeconds == 0) revert InvalidCooldown();
        uint256 oldCooldown = cooldownSeconds;
        cooldownSeconds = _cooldownSeconds;
        emit CooldownSet(oldCooldown, _cooldownSeconds);
    }

    function openBatch() external onlyProvider whenNotPaused {
        if (block.timestamp < lastSubmissionTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        lastSubmissionTime[msg.sender] = block.timestamp;

        currentBatchId++;
        batchClosed[currentBatchId] = false;
        emit BatchOpened(currentBatchId);
    }

    function closeBatch(uint256 batchId) external onlyProvider whenNotPaused {
        if (batchId == 0 || batchId != currentBatchId || batchClosed[batchId]) revert InvalidBatchId();
        batchClosed[batchId] = true;
        emit BatchClosed(batchId);
    }

    function submitPlayerData(
        uint256 batchId,
        euint32 inputSequenceHash,
        euint32 memoryPatternHash,
        euint32 score,
        euint32 timestamp
    ) external onlyProvider whenNotPaused {
        if (batchId == 0 || batchId != currentBatchId || batchClosed[batchId]) revert BatchClosedOrInvalid();
        if (block.timestamp < lastSubmissionTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        lastSubmissionTime[msg.sender] = block.timestamp;

        _initIfNeeded();

        PlayerData storage data = batchPlayerData[batchId][msg.sender]; // Using provider address as player identifier for simplicity
        data.inputSequenceHash = inputSequenceHash;
        data.memoryPatternHash = memoryPatternHash;
        data.score = score;
        data.timestamp = timestamp;

        batchPlayers[batchId].push(msg.sender);
        emit PlayerDataSubmitted(msg.sender, batchId);
    }

    function analyzeBatch(uint256 batchId) external onlyProvider whenNotPaused returns (uint256 requestId) {
        if (batchId == 0 || !batchClosed[batchId]) revert InvalidBatchId();
        if (block.timestamp < lastDecryptionRequestTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        lastDecryptionRequestTime[msg.sender] = block.timestamp;

        _initIfNeeded();

        // Perform encrypted analysis
        // This is a simplified example. Real analysis would be more complex.
        // For this example, we'll just sum scores and check against a threshold.
        // The actual cheat detection logic would be more sophisticated and operate on encrypted data.

        euint32 encryptedTotalScore;
        euint32 encryptedThreshold = FHE.asEuint32(10000); // Example threshold

        for (uint i = 0; i < batchPlayers[batchId].length; i++) {
            address player = batchPlayers[batchId][i];
            PlayerData storage data = batchPlayerData[batchId][player];
            encryptedTotalScore = encryptedTotalScore.add(data.score);
        }
        
        euint32 encryptedCheatScore = encryptedTotalScore.sub(encryptedThreshold); // If total score > threshold, this will be positive
        ebool encryptedIsCheat = encryptedCheatScore.ge(FHE.asEuint32(0)); // isCheat = (totalScore >= threshold)

        AnalysisResult storage result = batchAnalysisResults[batchId];
        result.batchId = FHE.asEuint32(batchId);
        result.cheatScore = encryptedCheatScore;
        result.isCheatDetected = encryptedIsCheat;

        // Prepare for decryption
        // We only decrypt the final result (cheatScore and isCheatDetected) for reporting
        euint32[] memory ctsArray = new euint32[](2);
        ctsArray[0] = result.cheatScore;
        ctsArray[1] = result.isCheatDetected.toEuint32(); // Convert ebool to euint32 for consistent array type

        bytes32 stateHash = _hashCiphertexts(ctsArray);
        requestId = FHE.requestDecryption(ctsArray, this.myCallback.selector);
        decryptionContexts[requestId] = DecryptionContext({ batchId: batchId, stateHash: stateHash, processed: false });
        emit AnalysisRequested(requestId, batchId);
    }

    function myCallback(uint256 requestId, bytes memory cleartexts, bytes memory proof) public {
        if (decryptionContexts[requestId].processed) revert ReplayAttempt();

        // Rebuild ciphertexts from storage in the same order as during request
        // This is crucial for state verification
        uint256 batchId = decryptionContexts[requestId].batchId;
        AnalysisResult storage result = batchAnalysisResults[batchId];
        euint32[] memory ctsArray = new euint32[](2);
        ctsArray[0] = result.cheatScore;
        ctsArray[1] = result.isCheatDetected.toEuint32();

        bytes32 currentHash = _hashCiphertexts(ctsArray);
        if (currentHash != decryptionContexts[requestId].stateHash) {
            revert StateMismatch();
        }

        // Verify proof
        if (!FHE.checkSignatures(requestId, cleartexts, proof)) {
            revert InvalidProof();
        }

        // Decode cleartexts in the same order
        // cleartexts is abi.encodePacked(uint256, uint256) for cheatScore and isCheatDetected
        // Each uint256 is 32 bytes
        uint256 cheatScoreCleartext = abi.decode(cleartexts[:32], (uint256));
        uint256 isCheatDetectedCleartext = abi.decode(cleartexts[32:64], (uint256));
        bool isCheatDetectedBool = (isCheatDetectedCleartext != 0);

        decryptionContexts[requestId].processed = true;
        emit AnalysisComplete(requestId, batchId, cheatScoreCleartext, isCheatDetectedBool);
    }

    function _hashCiphertexts(euint32[] memory ctsArray) internal pure returns (bytes32) {
        bytes32[] memory ctsBytes = new bytes32[](ctsArray.length);
        for (uint i = 0; i < ctsArray.length; i++) {
            ctsBytes[i] = FHE.toBytes32(ctsArray[i]);
        }
        return keccak256(abi.encode(ctsBytes, address(this)));
    }

    function _initIfNeeded() internal {
        if (!FHE.isInitialized(address(this))) {
            FHE.initialize(address(this));
        }
    }

    function _requireInitialized() internal view {
        if (!FHE.isInitialized(address(this))) {
            revert NotInitialized();
        }
    }
}