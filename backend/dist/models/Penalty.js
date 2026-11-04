"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Penalty = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const PenaltySchema = new mongoose_1.Schema({
    employeeId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Employee', required: true },
    deviceUid: { type: String, required: true },
    type: { type: String, enum: ['INACTIVITY'], default: 'INACTIVITY' },
    reason: { type: String, default: '' },
    sessionMinutes: { type: Number, default: 180 },
    days: { type: Number, default: 2 },
    status: { type: String, enum: ['PENDING', 'ACTIVE', 'DONE'], default: 'PENDING' },
    triggeredAt: { type: Date, default: Date.now },
    activatedAt: { type: Date },
    expiresAt: { type: Date },
}, { timestamps: true });
PenaltySchema.index({ employeeId: 1, status: 1 });
exports.Penalty = mongoose_1.default.model('Penalty', PenaltySchema);
