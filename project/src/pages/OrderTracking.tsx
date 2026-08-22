import { useState, useEffect } from 'react';
import { Package, ShieldCheck, Truck, CheckCircle2, Clock, Lock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { OrderWithDetails } from '@/types';
import { formatCurrency, formatCurrencyPrecise, timeAgo, SHIPPING_RATES } from '@/lib/theme';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';
import { payForOrder } from '@/lib/closeAuction';

interface OrderTrackingProps {
  navigate: (path: string) => void;
}

export function OrderTracking({ navigate }: OrderTrackingProps) {
  const { showToast } = useToast();
  const { session } = useAuth();
  const [orders, setOrders] = useState<OrderWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('paid=1')) {
      showToast('Payment received. Funds are held in escrow.', 'success');
    } else if (hash.includes('cancelled=1')) {
      showToast('Checkout cancelled — you can pay anytime from Orders.', 'info');
    }
  }, []);

  useEffect(() => {
    async function load() {
      if (!session?.user?.id) {
        setLoading(false);
        return;
      }

      const { data: orderData } = await supabase
        .from('orders')
        .select('*, artwork:artworks(*)')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (!orderData) {
        setLoading(false);
        return;
      }

      const artworkIds = orderData.map((o: any) => o.artwork_id);
      if (artworkIds.length === 0) {
        setOrders([]);
        setLoading(false);
        return;
      }

      const { data: artworkData } = await supabase
        .from('artworks')
        .select('id, artist:artists(*)')
        .in('id', artworkIds);

      const artistMap = new Map();
      (artworkData || []).forEach((aw: any) => {
        if (aw.artist) artistMap.set(aw.id, aw.artist);
      });

      const result: OrderWithDetails[] = orderData.map((o: any) => ({
        ...o,
        artwork: o.artwork,
        artist: artistMap.get(o.artwork_id),
      }));

      setOrders(result);
      setLoading(false);
    }
    load();
  }, [session, refreshKey]);

  const updateTracking = async (orderId: string) => {
    const trackingNum = `TRK-2024-${Math.floor(Math.random() * 999999).toString().padStart(6, '0')}`;
    const { error } = await supabase
      .from('orders')
      .update({ status: 'shipped', tracking_number: trackingNum })
      .eq('id', orderId);

    if (error) {
      showToast('Failed to update tracking.', 'error');
      return;
    }
    showToast(`Tracking number ${trackingNum} assigned.`, 'success');
    setRefreshKey((k) => k + 1);
  };

  const confirmDelivery = async (orderId: string) => {
    const { error } = await supabase.rpc('release_order_funds', { p_order_id: orderId });

    if (error) {
      showToast(error.message || 'Failed to confirm delivery.', 'error');
      return;
    }
    showToast('Delivery confirmed! Escrow released to artist.', 'success');
    setRefreshKey((k) => k + 1);
  };

  const raiseClaim = async (orderId: string, reason: string) => {
    const { error } = await supabase.rpc('raise_order_claim', { p_order_id: orderId, p_reason: reason });

    if (error) {
      showToast(error.message || 'Failed to raise claim.', 'error');
      return false;
    }
    showToast('Claim submitted. The artist has been notified to respond.', 'success');
    setRefreshKey((k) => k + 1);
    return true;
  };

  const completePayment = async (orderId: string) => {
    const { error, redirected } = await payForOrder(orderId);
    if (redirected) return {};
    if (error) {
      showToast(error, 'error');
      return { error };
    }
    showToast('Payment complete! Funds held in escrow.', 'success');
    setRefreshKey((k) => k + 1);
    return {};
  };

  if (!session) {
    return (
      <div className="max-w-[1600px] mx-auto px-6 lg:px-10 py-20 text-center">
        <p className="text-ink-400 text-lg">Please sign in to view your orders.</p>
        <button onClick={() => navigate('auth')} className="btn-primary mt-4 text-sm">Sign In</button>
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto px-6 lg:px-10 py-8">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.25em] text-accent-500 font-semibold mb-2">Checkout & Tracking</p>
        <h1 className="font-serif text-3xl md:text-4xl font-semibold tracking-tight">Your Orders</h1>
        <p className="text-sm text-ink-500 mt-2 max-w-lg">
          Track your purchases from escrow to delivery. Payments are held securely until you confirm receipt.
        </p>
      </div>

      {/* Escrow info banner */}
      <div className="flex items-start gap-3 p-5 bg-ink-100 dark:bg-ink-800 mb-8">
        <Lock className="w-5 h-5 text-ink-600 dark:text-ink-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold">Escrow Protection Active</p>
          <p className="text-xs text-ink-500 mt-1 leading-relaxed">
            All payments are held in escrow until you receive tracking confirmation and verify delivery.
            Funds are only released to the artist after successful delivery.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-ink-400 text-sm">Loading orders...</div>
      ) : orders.length === 0 ? (
        <div className="card-surface p-12 text-center">
          <Package className="w-12 h-12 text-ink-300 dark:text-ink-700 mx-auto mb-4" />
          <p className="text-ink-400 font-serif text-lg">No orders yet.</p>
          <p className="text-sm text-ink-500 mt-1">Win an auction to see your orders here.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onUpdateTracking={() => updateTracking(order.id)}
              onConfirmDelivery={() => confirmDelivery(order.id)}
              onRaiseClaim={(reason) => raiseClaim(order.id, reason)}
              onCompletePayment={() => completePayment(order.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface OrderCardProps {
  order: OrderWithDetails;
  onUpdateTracking: () => void;
  onConfirmDelivery: () => void;
  onRaiseClaim: (reason: string) => Promise<boolean>;
  onCompletePayment: () => Promise<{ error?: string }>;
}

function OrderCard({ order, onUpdateTracking, onConfirmDelivery, onRaiseClaim, onCompletePayment }: OrderCardProps) {
  const { artwork, artist } = order;
  const shipping = SHIPPING_RATES[order.shipping_tier];
  const total = order.amount + order.shipping_cost;
  const [claimFormOpen, setClaimFormOpen] = useState(false);
  const [claimReason, setClaimReason] = useState('');
  const [submittingClaim, setSubmittingClaim] = useState(false);
  const [payingNow, setPayingNow] = useState(false);

  const handlePay = async () => {
    setPayingNow(true);
    try {
      await onCompletePayment();
    } finally {
      setPayingNow(false);
    }
  };

  const claimWindowOpen = order.paid_at
    ? Date.now() < new Date(order.paid_at).getTime() + 72 * 60 * 60 * 1000
    : false;

  const handleSubmitClaim = async () => {
    setSubmittingClaim(true);
    const ok = await onRaiseClaim(claimReason);
    setSubmittingClaim(false);
    if (ok) {
      setClaimFormOpen(false);
      setClaimReason('');
    }
  };

  const steps = [
    { key: 'escrow', label: 'Escrow Hold', icon: Lock, description: 'Payment secured' },
    { key: 'shipped', label: 'Shipped', icon: Truck, description: 'In transit to buyer' },
    { key: 'delivered', label: 'Delivered', icon: Package, description: 'Package arrived' },
    { key: 'completed', label: 'Completed', icon: CheckCircle2, description: 'Funds released' },
  ];

  const currentStepIndex = steps.findIndex((s) => s.key === order.status);

  return (
    <div className="card-surface overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-0">
        {/* Image */}
        <div className="aspect-square lg:aspect-auto lg:h-full bg-ink-100 dark:bg-ink-800 overflow-hidden">
          <img src={artwork?.image_url} alt={artwork?.title} className="w-full h-full object-cover" />
        </div>

        {/* Details */}
        <div className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <StatusBadge status={order.status} />
                <span className="text-xs text-ink-400">{timeAgo(order.created_at)}</span>
              </div>
              <h3 className="font-serif text-xl font-semibold">{artwork?.title}</h3>
              <p className="text-sm text-ink-500">{artist?.name} · {artwork?.medium}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-widest text-ink-400">Total Paid</p>
              <p className="font-mono text-2xl font-bold">{formatCurrency(total)}</p>
            </div>
          </div>

          {/* Price breakdown */}
          <div className="grid grid-cols-3 gap-4 mb-6 py-4 border-y border-ink-100 dark:border-ink-800">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-ink-400">Winning Bid</p>
              <p className="font-mono text-sm font-semibold mt-0.5">{formatCurrencyPrecise(order.amount)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-ink-400">Shipping ({shipping.label})</p>
              <p className="font-mono text-sm font-semibold mt-0.5">{formatCurrencyPrecise(order.shipping_cost)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-ink-400">Escrow</p>
              <p className="text-sm font-semibold mt-0.5 flex items-center gap-1">
                <Lock className="w-3 h-3" />
                {order.status === 'completed' ? 'Released' : 'Held'}
              </p>
            </div>
          </div>

          {/* Receipt confirmation */}
          <div className="mb-6 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                Purchase Confirmed
              </p>
            </div>
            <p className="text-xs text-emerald-700 dark:text-emerald-400 leading-relaxed">
              You purchased <span className="font-semibold">{artwork?.title}</span> for{' '}
              <span className="font-mono font-semibold">{formatCurrencyPrecise(order.amount)}</span> plus{' '}
              <span className="font-mono font-semibold">{formatCurrencyPrecise(order.shipping_cost)}</span> shipping
              — total <span className="font-mono font-semibold">{formatCurrencyPrecise(order.amount + order.shipping_cost)}</span>.
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-emerald-600 dark:text-emerald-500">
              {order.receipt_number && <span>Receipt #{order.receipt_number}</span>}
              {order.paid_at && <span>{new Date(order.paid_at).toLocaleString()}</span>}
              {order.buyer_email && <span>Sent to {order.buyer_email}</span>}
            </div>
          </div>

          {/* Checkout - order won but not yet paid */}
          {order.status === 'pending_payment' ? (
            <div className="mb-2 p-5 bg-ink-50 dark:bg-ink-900 border border-ink-200 dark:border-ink-800">
              <p className="text-sm font-semibold mb-1">Complete Payment</p>
              <p className="text-xs text-ink-500 mb-4">
                You will be redirected to Stripe Checkout to pay securely. Funds are held in escrow
                until delivery is confirmed.
              </p>
              <p className="text-sm font-mono font-semibold mb-4">
                Total due {formatCurrency(total)}
                <span className="text-xs font-sans font-normal text-ink-500 ml-2">
                  (artwork + shipping)
                </span>
              </p>
              <button
                onClick={handlePay}
                disabled={payingNow}
                className="btn-accent w-full py-3 text-sm disabled:opacity-40"
              >
                {payingNow ? 'Redirecting to Stripe…' : `Pay ${formatCurrency(total)} with Stripe`}
              </button>
              <p className="text-[11px] text-ink-400 mt-3">
                Test mode card: 4242 4242 4242 4242 · any future expiry · any CVC
              </p>
            </div>
          ) : (
            <>
          {/* Dispute status banner */}
          {order.dispute_status !== 'none' && (
            <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              {order.dispute_status === 'claim_raised' && (
                <>
                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Claim submitted — awaiting artist response</p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-1 leading-relaxed">{order.claim_reason}</p>
                </>
              )}
              {order.dispute_status === 'evidence_submitted' && (
                <>
                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Evidence submitted — awaiting review</p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-1 leading-relaxed">Atelier will review the artist's response against our verification policy.</p>
                </>
              )}
              {order.dispute_status === 'resolved_upheld' && (
                <>
                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Claim upheld</p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-1 leading-relaxed">{order.resolution_notes}</p>
                </>
              )}
              {order.dispute_status === 'resolved_denied' && (
                <>
                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Claim reviewed — not upheld</p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-1 leading-relaxed">{order.resolution_notes}</p>
                </>
              )}
            </div>
          )}

          {/* Tracking timeline */}
          <div className="mb-6">
            <div className="flex items-center justify-between relative">
              <div className="absolute top-4 left-0 right-0 h-px bg-ink-200 dark:bg-ink-700" />
              <div
                className="absolute top-4 left-0 h-px bg-emerald-500 transition-all duration-500"
                style={{ width: `${(currentStepIndex / (steps.length - 1)) * 100}%` }}
              />
              {steps.map((step, i) => {
                const isDone = i <= currentStepIndex;
                const isCurrent = i === currentStepIndex;
                return (
                  <div key={step.key} className="relative z-10 flex flex-col items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
                      isDone
                        ? 'bg-emerald-500 text-white'
                        : 'bg-ink-100 dark:bg-ink-800 text-ink-400'
                    } ${isCurrent ? 'ring-4 ring-emerald-500/20' : ''}`}>
                      <step.icon className="w-4 h-4" />
                    </div>
                    <p className={`text-[10px] uppercase tracking-wider font-semibold mt-2 text-center ${isDone ? 'text-ink-900 dark:text-ink-100' : 'text-ink-400'}`}>
                      {step.label}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tracking number + actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {order.tracking_number ? (
              <div className="flex items-center gap-2 text-sm">
                <Truck className="w-4 h-4 text-ink-500" />
                <span className="text-ink-500">Tracking:</span>
                <span className="font-mono font-semibold">{order.tracking_number}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-ink-400">
                <Clock className="w-4 h-4" />
                <span>Awaiting shipment from artist</span>
              </div>
            )}

            <div className="flex flex-col gap-2 items-end">
              <div className="flex gap-2">
                {order.status === 'escrow' && (
                  <button onClick={onUpdateTracking} className="btn-secondary text-xs py-2 px-4">
                    <span className="flex items-center gap-1.5">
                      <Truck className="w-3.5 h-3.5" />
                      Add Tracking
                    </span>
                  </button>
                )}
                {(order.status === 'shipped' || order.status === 'delivered') && order.dispute_status === 'none' && (
                  <>
                    <button onClick={onConfirmDelivery} className="btn-accent text-xs py-2 px-4">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Confirm Delivery
                      </span>
                    </button>
                    {claimWindowOpen && (
                      <button onClick={() => setClaimFormOpen((v) => !v)} className="btn-secondary text-xs py-2 px-4">
                        Raise a Claim
                      </button>
                    )}
                  </>
                )}
                {order.status === 'completed' && (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    <ShieldCheck className="w-4 h-4" />
                    Order Complete
                  </span>
                )}
              </div>

              {claimFormOpen && (
                <div className="w-full sm:w-96 p-3 bg-ink-50 dark:bg-ink-900 border border-ink-200 dark:border-ink-800">
                  <label className="text-xs text-ink-500 mb-1 block">
                    What specifically are you disputing? (min 20 characters)
                  </label>
                  <textarea
                    value={claimReason}
                    onChange={(e) => setClaimReason(e.target.value)}
                    className="w-full text-xs p-2 border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950 rounded"
                    rows={3}
                    placeholder="e.g. no visible brush texture in the high-res photos, no process video was provided despite listing claiming one exists..."
                  />
                  <div className="flex justify-end gap-2 mt-2">
                    <button
                      onClick={() => { setClaimFormOpen(false); setClaimReason(''); }}
                      className="text-xs text-ink-500 px-3 py-1.5"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSubmitClaim}
                      disabled={claimReason.trim().length < 20 || submittingClaim}
                      className="btn-accent text-xs py-1.5 px-3 disabled:opacity-40"
                    >
                      {submittingClaim ? 'Submitting...' : 'Submit Claim'}
                    </button>
                  </div>
                </div>
              )}
            </div>
            </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; classes: string }> = {
    refunded: { label: 'Refunded', classes: 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300' },
    pending_payment: { label: 'Payment Due', classes: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400' },
    escrow: { label: 'In Escrow', classes: 'bg-gold-100 text-gold-700 dark:bg-gold-500/20 dark:text-gold-400' },
    shipped: { label: 'Shipped', classes: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400' },
    delivered: { label: 'Delivered', classes: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400' },
    completed: { label: 'Completed', classes: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' },
  };

  const { label, classes } = config[status] || config.escrow;

  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${classes}`}>
      {label}
    </span>
  );
}
