import React, { useState, useEffect, useRef } from 'react';
import { 
  BarChart, 
  Globe, 
  MousePointerClick, 
  Users, 
  PlusCircle, 
  Image as ImageIcon, 
  Link as LinkIcon, 
  Copy, 
  Check, 
  ArrowRight
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface CountryStat {
  country: string;
  count: number;
}

interface LinkStat {
  id: string;
  slug: string;
  bio: string;
  screenshot_path: string;
  created_at: string;
  total_clicks: number;
  unique_clicks: number;
  countries: CountryStat[];
}

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ??
  '';

const LINK_BASE =
  (import.meta.env.VITE_LINK_BASE_URL as string | undefined)?.replace(/\/$/, '') ??
  '';

function apiPath(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${p}`;
}

function linkOrigin(): string {
  if (LINK_BASE) return LINK_BASE;
  return window.location.origin;
}

function mediaSrc(screenshotPath: string): string {
  const p = screenshotPath.startsWith('/')
    ? screenshotPath
    : `/${screenshotPath}`;
  return `${API_BASE}${p}`;
}

export default function App() {
  const [links, setLinks] = useState<LinkStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [slug, setSlug] = useState('');
  const [bio, setBio] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const fetchLinks = async () => {
    try {
      const res = await fetch(apiPath('/api/links'));
      if (res.ok) {
        const data = await res.json();
        setLinks(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLinks();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedField = e.target.files[0];
      setFile(selectedField);
      const url = URL.createObjectURL(selectedField);
      setPreview(url);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug) return alert("Slug is required");

    setSubmitting(true);
    const formData = new FormData();
    formData.append('slug', slug);
    if (bio) formData.append('bio', bio);
    if (file) formData.append('screenshot', file);

    try {
      const res = await fetch(apiPath('/api/links'), {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        setSlug('');
        setBio('');
        setFile(null);
        setPreview(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        await fetchLinks();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to create link");
      }
    } catch (err) {
      console.error(err);
      alert("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = (linkSlug: string) => {
    const url = `${linkOrigin()}/${linkSlug}`;
    navigator.clipboard.writeText(url);
    setCopied(linkSlug);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 p-4 md:p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 flex items-center gap-2">
              <BarChart className="text-blue-600" />
              LinkAnalytics
            </h1>
            <p className="text-zinc-500 mt-1">Track links, visitors, and custom domains instantly.</p>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column: Form */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-200">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-zinc-400" />
                Create New Link
              </h2>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Custom End Path (Slug)</label>
                  <div className="flex rounded-md shadow-sm">
                    <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-zinc-300 bg-zinc-50 text-zinc-500 text-sm">
                      /
                    </span>
                    <input
                      type="text"
                      className="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md border border-zinc-300 focus:ring-blue-500 focus:border-blue-500 text-sm"
                      placeholder="example"
                      value={slug}
                      onChange={(e) => setSlug(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Bio (Optional)</label>
                  <textarea
                    rows={3}
                    className="block w-full px-3 py-2 rounded-md border border-zinc-300 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    placeholder="Enter a short bio or text"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                  ></textarea>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Screenshot (Optional)</label>
                  
                  <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-zinc-300 border-dashed rounded-md hover:border-blue-500 transition-colors bg-zinc-50 cursor-pointer relative" onClick={() => fileInputRef.current?.click()}>
                    <div className="space-y-1 text-center">
                      {preview ? (
                         <img src={preview} alt="Preview" className="mx-auto h-32 object-contain" />
                      ) : (
                        <ImageIcon className="mx-auto h-12 w-12 text-zinc-400" />
                      )}
                      <div className="flex text-sm text-zinc-600 justify-center">
                        <span className="relative rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none">
                          <span>Upload a file</span>
                          <input 
                            id="file-upload" 
                            name="file-upload" 
                            type="file" 
                            className="sr-only" 
                            accept="image/*"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                          />
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500">PNG, JPG, GIF up to 5MB</p>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-zinc-900 hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-zinc-900 transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Create Link'}
                </button>
              </form>
            </div>
          </div>

          {/* Right Column: List of Links */}
          <div className="lg:col-span-2 space-y-4">
             {loading ? (
                <div className="animate-pulse space-y-4">
                  {[1,2,3].map(i => (
                    <div key={i} className="h-40 bg-zinc-200 rounded-2xl w-full"></div>
                  ))}
                </div>
             ) : links.length === 0 ? (
                <div className="bg-white p-12 rounded-2xl shadow-sm border border-zinc-200 text-center flex flex-col items-center">
                   <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-4">
                     <LinkIcon className="w-8 h-8" />
                   </div>
                   <h3 className="text-lg font-medium text-zinc-900">No links created yet</h3>
                   <p className="text-zinc-500 mt-1 max-w-sm">Create your first custom link on the left to start tracking visitors and origins.</p>
                </div>
             ) : (
                links.map((link) => (
                  <div key={link.id} className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden flex flex-col sm:flex-row">
                     {/* Thumbnail side */}
                     {link.screenshot_path ? (
                       <div className="w-full sm:w-48 h-48 sm:h-auto bg-zinc-100 flex-shrink-0 relative border-b sm:border-b-0 sm:border-r border-zinc-200">
                          <img src={mediaSrc(link.screenshot_path)} alt="Thumbnail" className="w-full h-full object-cover absolute inset-0" />
                       </div>
                     ) : (
                       <div className="w-full sm:w-48 h-32 sm:h-auto bg-zinc-50 flex flex-col items-center justify-center flex-shrink-0 border-b sm:border-b-0 sm:border-r border-zinc-200 text-zinc-400">
                          <ImageIcon className="w-8 h-8 mb-2 opacity-50" />
                          <span className="text-xs uppercase font-medium tracking-wider">No Image</span>
                       </div>
                     )}

                     {/* Content Side */}
                     <div className="p-5 flex-1 flex flex-col justify-between">
                        <div>
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="text-lg font-semibold text-zinc-900 flex items-center group">
                                  /{link.slug}
                                </h3>
                                <button 
                                  onClick={() => handleCopy(link.slug)}
                                  className="text-zinc-400 hover:text-blue-600 p-1 rounded-md transition-colors bg-zinc-50 hover:bg-blue-50"
                                  title="Copy URL"
                                >
                                  {copied === link.slug ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                                </button>
                              </div>
                            </div>
                            <span className="text-xs text-zinc-400 bg-zinc-100 px-2 py-1 rounded-full font-medium whitespace-nowrap">
                              {formatDistanceToNow(new Date(link.created_at), { addSuffix: true })}
                            </span>
                          </div>
                          {link.bio && (
                            <p className="text-sm text-zinc-600 mt-2 italic line-clamp-2">{link.bio}</p>
                          )}
                        </div>

                        <div className="mt-6 pt-4 border-t border-zinc-100 grid grid-cols-2 md:grid-cols-4 gap-4">
                           <div>
                             <p className="text-xs font-medium text-zinc-500 uppercase tracking-widest flex items-center gap-1 mb-1">
                               <MousePointerClick className="w-3 h-3" /> Clicks
                             </p>
                             <p className="text-2xl font-semibold text-zinc-900">{link.total_clicks}</p>
                           </div>
                           <div>
                             <p className="text-xs font-medium text-zinc-500 uppercase tracking-widest flex items-center gap-1 mb-1">
                               <Users className="w-3 h-3" /> Unique
                             </p>
                             <p className="text-2xl font-semibold text-zinc-900">{link.unique_clicks}</p>
                           </div>
                           <div className="col-span-2">
                             <p className="text-xs font-medium text-zinc-500 uppercase tracking-widest flex items-center gap-1 mb-1">
                               <Globe className="w-3 h-3" /> Top Countries
                             </p>
                             <div className="flex flex-wrap gap-2 mt-1.5">
                                {link.countries && link.countries.length > 0 ? (
                                  link.countries.slice(0, 3).map((c, i) => (
                                    <span key={i} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-zinc-100 text-zinc-800">
                                      {c.country} <span className="opacity-50 ml-1">({c.count})</span>
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-xs text-zinc-400 italic">No data yet</span>
                                )}
                             </div>
                           </div>
                        </div>
                     </div>
                  </div>
                ))
             )}
          </div>
        </div>
      </div>
    </div>
  );
}
