'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, ChevronDown, ChevronUp, ExternalLink, AlertTriangle,
  Bug, Search, Filter,
} from 'lucide-react';

interface CvePanelProps {
  data: any;
  isOpen: boolean;
  onClose: () => void;
}

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: '#FF1744',
  HIGH: '#FF9500',
  MEDIUM: '#FFD700',
  LOW: '#00E676',
};

const SEVERITY_LABELS: Record<string, string> = {
  CRITICAL: 'CRIT',
  HIGH: 'HIGH',
  MEDIUM: 'MED',
  LOW: 'LOW',
};

function CveItem({ cve }: { cve: any }) {
  const [expanded, setExpanded] = useState(false);
  const severity = cve.severity || 'UNKNOWN';
  const color = SEVERITY_COLORS[severity] || '#9E9E9E';
  const score = cve.cvss_score ?? cve.cvssScore ?? null;
  const epss = cve.epss_score ?? cve.epssScore ?? null;

  return (
    <div className="border-b border-[var(--border-secondary)]/30 last:border-b-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-2 py-2 hover:bg-white/[0.02] transition-colors text-left"
      >
        {/* Severity dot */}
        <div
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: color, boxShadow: `0 0 4px ${color}60` }}
        />
        {/* CVE ID */}
        <span className="text-[10px] font-mono font-bold text-[var(--gold-primary)] flex-shrink-0 w-[110px]">
          {cve.id}
        </span>
        {/* Score badge */}
        {score !== null && (
          <span
            className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded"
            style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}
          >
            {score}
          </span>
        )}
        {/* Truncated description */}
        <span className="text-[9px] font-mono text-[var(--text-secondary)] truncate flex-1">
          {cve.description || 'No description available'}
        </span>
        {/* Expand icon */}
        {expanded
          ? <ChevronUp className="w-3 h-3 text-[var(--text-muted)] flex-shrink-0" />
          : <ChevronDown className="w-3 h-3 text-[var(--text-muted)] flex-shrink-0" />
        }
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-2">
              {/* Full description */}
              <p className="text-[10px] font-mono text-[var(--text-secondary)] leading-relaxed">
                {cve.description || 'No description available'}
              </p>

              {/* Meta row */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-[8px] font-mono text-[var(--text-muted)]">
                  SEV: <span style={{ color }}>{severity}</span>
                </span>
                {score !== null && (
                  <span className="text-[8px] font-mono text-[var(--text-muted)]">
                    CVSS: <span style={{ color }}>{score}</span>
                  </span>
                )}
                {epss !== null && (
                  <span className="text-[8px] font-mono text-[var(--text-muted)]">
                    EPSS: <span className="text-[var(--cyan-primary)]">{(epss * 100).toFixed(1)}%</span>
                  </span>
                )}
                {cve.published && (
                  <span className="text-[8px] font-mono text-[var(--text-muted)]">
                    {new Date(cve.published).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                )}
              </div>

              {/* CWE */}
              {cve.cwe && cve.cwe.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap">
                  {cve.cwe.slice(0, 3).map((c: string) => (
                    <span key={c} className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-white/[0.04] text-[var(--text-muted)] border border-white/[0.06]">
                      {c}
                    </span>
                  ))}
                </div>
              )}

              {/* Affected products */}
              {cve.affected_products && cve.affected_products.length > 0 && (
                <div className="text-[8px] font-mono text-[var(--text-muted)]">
                  AFFECTED: {cve.affected_products.slice(0, 5).join(', ')}{cve.affected_products.length > 5 ? ` +${cve.affected_products.length - 5} more` : ''}
                </div>
              )}

              {/* References */}
              {cve.references && cve.references.length > 0 && (
                <div className="space-y-0.5">
                  {cve.references.slice(0, 3).map((ref: string, i: number) => (
                    <a
                      key={i}
                      href={ref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[8px] font-mono text-[var(--cyan-primary)] hover:text-[var(--gold-primary)] transition-colors truncate"
                    >
                      <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                      <span className="truncate">{ref}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function CvePanel({ data, isOpen, onClose }: CvePanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [filterSeverity, setFilterSeverity] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const cveData = data.cve || [];
  const stats = cveData.stats || {};
  const source = cveData.source || 'unknown';

  // Flatten: data.cve is either { cves: [...], stats: {...} } or just [...]
  const cves: any[] = Array.isArray(cveData) ? cveData : (cveData.cves || []);

  const filtered = cves.filter((c: any) => {
    if (filterSeverity !== 'ALL' && (c.severity || 'UNKNOWN') !== filterSeverity) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchId = (c.id || '').toLowerCase().includes(q);
      const matchDesc = (c.description || '').toLowerCase().includes(q);
      if (!matchId && !matchDesc) return false;
    }
    return true;
  });

  const criticalCount = cves.filter((c: any) => c.severity === 'CRITICAL').length;
  const highCount = cves.filter((c: any) => c.severity === 'HIGH').length;

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="absolute top-16 md:top-20 right-2 md:right-5 z-[300] w-[380px] max-h-[70vh] overflow-hidden flex flex-col"
    >
      <div className="glass-panel osiris-glow flex flex-col max-h-[70vh]" style={{ borderColor: '#E91E6330' }}>
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-[var(--border-secondary)]/30 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Bug className="w-4 h-4" style={{ color: '#E91E63' }} />
            <span className="hud-text text-[12px] text-[var(--text-primary)] tracking-widest font-bold">CVE INTELLIGENCE</span>
            <span className="text-[8px] font-mono px-1.5 py-0.5 rounded" style={{ background: '#E91E6315', color: '#E91E63', border: '1px solid #E91E6330' }}>
              {cves.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[8px] font-mono text-[var(--text-muted)]">{source}</span>
            <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xs">✕</button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-3 px-3 py-2 border-b border-[var(--border-secondary)]/20 flex-shrink-0">
          {criticalCount > 0 && (
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#FF1744' }} />
              <span className="text-[9px] font-mono font-bold" style={{ color: '#FF1744' }}>{criticalCount} CRIT</span>
            </div>
          )}
          {highCount > 0 && (
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#FF9500' }} />
              <span className="text-[9px] font-mono font-bold" style={{ color: '#FF9500' }}>{highCount} HIGH</span>
            </div>
          )}
          {stats.total !== undefined && (
            <span className="text-[8px] font-mono text-[var(--text-muted)]">TOTAL: {stats.total}</span>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border-secondary)]/20 flex-shrink-0">
          <div className="flex items-center gap-1 flex-1">
            <Search className="w-3 h-3 text-[var(--text-muted)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search CVE ID or keyword..."
              className="flex-1 bg-transparent text-[10px] font-mono text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
            />
          </div>
          <div className="flex gap-0.5">
            {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM'].map(sev => (
              <button
                key={sev}
                onClick={() => setFilterSeverity(sev)}
                className="text-[8px] font-mono px-1.5 py-0.5 rounded transition-all"
                style={{
                  background: filterSeverity === sev ? `${(SEVERITY_COLORS[sev] || '#9E9E9E')}20` : 'transparent',
                  color: filterSeverity === sev ? (SEVERITY_COLORS[sev] || '#9E9E9E') : 'var(--text-muted)',
                  border: `1px solid ${filterSeverity === sev ? `${(SEVERITY_COLORS[sev] || '#9E9E9E')}40` : 'transparent'}`,
                }}
              >
                {SEVERITY_LABELS[sev] || sev}
              </button>
            ))}
          </div>
        </div>

        {/* CVE List */}
        <div className="flex-1 overflow-y-auto styled-scrollbar">
          {filtered.length === 0 ? (
            <div className="text-center py-8">
              <Shield className="w-6 h-6 text-[var(--text-muted)] mx-auto mb-2 opacity-30" />
              <span className="text-[10px] font-mono text-[var(--text-muted)]">
                {cves.length === 0 ? 'Toggle CVE layer to load data...' : 'No CVEs match filters'}
              </span>
            </div>
          ) : (
            filtered.map((cve: any) => (
              <CveItem key={cve.id} cve={cve} />
            ))
          )}
        </div>
      </div>
    </motion.div>
  );
}
