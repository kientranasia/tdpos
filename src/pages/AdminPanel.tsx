import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { LayoutDashboard, Users, CreditCard, ShieldCheck, Search, Filter, MoreVertical, ExternalLink } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { formatCurrency } from '../lib/utils';
import { mockTenants } from '../data/mock';

export default function AdminPanel() {
  const [searchTerm, setSearchTerm] = useState('');
  
  return (
    <div className="flex h-screen bg-slate-900 text-white overflow-hidden">
      {/* Sidebar */}
      <div className="w-72 bg-slate-950 border-r border-white/5 flex flex-col p-6 space-y-8">
        <div className="flex items-center gap-3 px-2">
            <div className="h-10 w-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-600/20 transform -rotate-3">
                <ShieldCheck className="h-6 w-6" />
            </div>
            <span className="font-black text-xl tracking-tighter uppercase italic">ADMIN CPANEL</span>
        </div>

        <nav className="flex-1 space-y-1">
            {[
                { label: 'Overview', icon: LayoutDashboard, active: true },
                { label: 'Tenants', icon: Users, active: false },
                { label: 'Subscriptions', icon: CreditCard, active: false },
                { label: 'Audit Logs', icon: ShieldCheck, active: false },
            ].map((item, i) => (
                <button 
                   key={i}
                   className={`w-full flex items-center gap-4 px-4 py-4 rounded-2xl transition-all font-black text-xs uppercase tracking-widest ${
                     item.active ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' : 'text-slate-500 hover:text-white hover:bg-white/5'
                   }`}
                >
                    <item.icon className="h-5 w-5" />
                    {item.label}
                </button>
            ))}
        </nav>

        <div className="p-6 bg-white/5 rounded-3xl space-y-4">
            <div className="space-y-1">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Powered by</p>
                <p className="text-sm font-black text-white uppercase italic tracking-tight">TRANDAO INVESTMENT</p>
            </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-24 px-10 border-b border-white/5 flex items-center justify-between bg-slate-950/50 backdrop-blur-xl">
            <div className="flex items-center gap-4 flex-1 max-w-xl">
                <div className="relative w-full">
                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                    <Input 
                        placeholder="Search tenants by name, email or ID..."
                        className="h-14 pl-14 rounded-2xl bg-white/5 border-white/10 text-white placeholder:text-slate-500 font-bold focus:ring-emerald-500/20"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="flex items-center gap-6">
                <div className="text-right">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Logged in as</p>
                    <p className="text-sm font-black text-emerald-400 uppercase italic">Super Admin</p>
                </div>
                <div className="h-12 w-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center font-black">
                    SA
                </div>
            </div>
        </header>

        <main className="flex-1 overflow-y-auto p-10 space-y-10 custom-scrollbar">
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                {[
                    { label: 'Total Tenants', val: mockTenants.length, color: 'text-emerald-400' },
                    { label: 'Active Users', val: '1,284', color: 'text-blue-400' },
                    { label: 'Monthly Revenue', val: formatCurrency(125000000), color: 'text-amber-400' },
                    { label: 'Server Status', val: 'Health: 100%', color: 'text-emerald-400' },
                ].map((stat, i) => (
                    <div key={i} className="p-8 bg-slate-950 border border-white/5 rounded-[32px] shadow-sm">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2">{stat.label}</p>
                        <p className={`text-2xl font-black italic tracking-tight ${stat.color}`}>{stat.val}</p>
                    </div>
                ))}
            </div>

            {/* Tenant Table */}
            <div className="bg-slate-950 rounded-[40px] border border-white/10 overflow-hidden shadow-2xl">
                <div className="p-8 border-b border-white/5 flex items-center justify-between">
                    <h3 className="text-xl font-black uppercase italic tracking-tight">Recent Tenants</h3>
                    <Button variant="ghost" className="h-10 px-4 rounded-xl text-slate-500 hover:text-white hover:bg-white/5 font-black text-[10px] uppercase tracking-widest">
                        Export CSV
                    </Button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-white/2 border-bottom border-white/5">
                                <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Tenant Info</th>
                                <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Status</th>
                                <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Subscription</th>
                                <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Created At</th>
                                <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {mockTenants.map(tenant => (
                                <tr key={tenant.id} className="hover:bg-white/2 transition-colors">
                                    <td className="px-8 py-6">
                                        <div className="flex items-center gap-4">
                                            <div className="h-12 w-12 rounded-2xl bg-emerald-600/10 text-emerald-500 border border-emerald-500/20 flex items-center justify-center font-black">
                                                {tenant.name.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="font-black text-white tracking-tight leading-none uppercase">{tenant.name}</p>
                                                <p className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-widest">ID: {tenant.id.toUpperCase()}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <span className="px-3 py-1 rounded-lg bg-emerald-500/10 text-emerald-500 text-[9px] font-black uppercase tracking-widest border border-emerald-500/20">
                                            Active
                                        </span>
                                    </td>
                                    <td className="px-8 py-6">
                                        <p className="text-sm font-black text-blue-400 uppercase italic">Enterprise</p>
                                    </td>
                                    <td className="px-8 py-6">
                                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">May 10, 2026</p>
                                    </td>
                                    <td className="px-8 py-6">
                                        <div className="flex justify-center gap-2">
                                            <Button variant="ghost" className="h-10 w-10 rounded-xl hover:bg-emerald-600 hover:text-white text-slate-500 transition-all">
                                                <ExternalLink className="h-4 w-4" />
                                            </Button>
                                            <Button variant="ghost" className="h-10 w-10 rounded-xl hover:bg-slate-800 text-slate-500 transition-all">
                                                <MoreVertical className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </main>
      </div>
    </div>
  );
}
