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
exports.DeepWorkSession = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const BreakRecordSchema = new mongoose_1.Schema({
    startTime: { type: Date, required: true },
    endTime: { type: Date },
    durationMinutes: { type: Number },
});
const DeepWorkSessionSchema = new mongoose_1.Schema({
    deviceUid: { type: String, required: true },
    employeeId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Employee', required: true },
    startTime: { type: Date, required: true, default: Date.now },
    endTime: { type: Date },
    activeMinutes: { type: Number, default: 0 },
    breaks: { type: [BreakRecordSchema], default: [] },
    breakCount: { type: Number, default: 0 },
    totalBreakMinutes: { type: Number, default: 0 },
    status: { type: String, enum: ['ACTIVE', 'BREAK', 'DYING', 'COMPLETED'], default: 'ACTIVE' },
    selfRating: { type: Number, default: 0, min: 0, max: 5 },
    sdwPointsEarned: { type: Number, default: 0 },
    productivitySpike: { type: Boolean, default: false },
}, { timestamps: true });
DeepWorkSessionSchema.index({ deviceUid: 1, status: 1 });
DeepWorkSessionSchema.index({ employeeId: 1, startTime: -1 });
exports.DeepWorkSession = mongoose_1.default.model('DeepWorkSession', DeepWorkSessionSchema);
