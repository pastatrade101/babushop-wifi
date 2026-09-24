<script lang="ts">
let {name='wifi',size=20}=$props<{name?:string;size?:number}>();
const paths:Record<string,string>={
 chevron:'m6 9 6 6 6-6',panel:'M3 4h18v16H3zM9 4v16M15 10l-2 2 2 2',money:'M12 3v18M16.5 7H10a3 3 0 0 0 0 6h4a3 3 0 0 1 0 6H7',
 payment:'M3 5h18v14H3zM3 9h18M7 15h3',reverse:'M4 9h9a6 6 0 0 1 0 12M4 9l5-5M4 9l5 5',
 search:'m21 21-4.5-4.5M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15',sun:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5',moon:'M20.8 13A9 9 0 0 1 11 3.2 9 9 0 1 0 20.8 13Z',monitor:'M3 4h18v13H3zM8 21h8m-4-4v4',
 wifi:'M2 8.8a16 16 0 0 1 20 0M5 12.5a11 11 0 0 1 14 0M8.5 16a5.5 5.5 0 0 1 7 0M12 20h.01',
 router:'M3 14h18v6H3zM7 17h.01M11 17h.01M15 17h3M8 14 6 6m10 8 2-8',
 overview:'M3 3h7v7H3zM14 3h7v4h-7zM14 11h7v10h-7zM3 14h7v7H3z',
 plus:'M12 5v14M5 12h14',ticket:'M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4zM15 6v2m0 3v2m0 3v2',
 batch:'M7 3h14v14M3 7h14v14H3zM7 11h6m-6 4h6',package:'m12 3 9 5v8l-9 5-9-5V8zM3 8l9 5 9-5M12 13v8M7.5 5.5l9 5',
 sales:'M5 3h14v18l-3-2-4 2-4-2-3 2zM9 8h6m-6 4h6',grants:'m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6',
 reports:'M4 20V4M4 20h16M8 16v-4m5 4V8m5 8V5',staff:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M17 4a4 4 0 0 1 0 7m2 4a4 4 0 0 1 3 4v2',
 network:'M12 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6M5 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6m14 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6M12 9v3M6.5 15 11 12.5m2 0 4.5 2.5',
 alert:'M12 9v4m0 3h.01M10.3 3.9 2.4 17a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0',
 settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M10 2h4l1 3 3 1 3-1 2 4-2 2v3l2 2-2 4-3-1-3 1-1 3h-4l-1-3-3-1-3 1-2-4 2-2v-3L0 9l2-4 3 1 3-1z',
 arrow:'M5 12h14m-6-6 6 6-6 6',logout:'M9 4H4v16h5m5-13 5 5-5 5M8 12h11',menu:'M4 6h16M4 12h16M4 18h16',close:'m6 6 12 12M6 18 18 6',check:'m5 12 4 4L19 6',clock:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7v5l3 2',
 // Router console: WinBox's menu and interface types.
 ethernet:'M4 6h16v12H4zM8 18v-4h8v4M8 10h.01M12 10h.01M16 10h.01',tunnel:'M4 20v-9a8 8 0 0 1 16 0v9M8 20v-8a4 4 0 0 1 8 0v8M2 20h20',
 bridge:'M8 3v18M16 3v18M3 8h18M3 16h18',ip:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
 firewall:'M3 5h18v14H3zM3 10h18M3 15h18M9 5v5M15 10v5M9 15v4',hotspot:'M5 12.5a11 11 0 0 1 14 0M8.5 16a5.5 5.5 0 0 1 7 0M2 8.8a16 16 0 0 1 20 0M12 20h.01',
 queues:'M4 6h16M4 12h11M4 18h6',folder:'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
 log:'M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7',terminal:'M3 5h18v14H3zM7 10l3 2-3 2M12 15h5',
 key:'M15.5 3a5.5 5.5 0 1 1-4.9 8L4 17.6V21h3v-2h2v-2h2l1.3-1.3A5.5 5.5 0 0 1 15.5 3M17 7h.01',
 tools:'M14.7 6.3a4 4 0 0 0 5 5L21 10a6 6 0 0 1-7.8 5.7L7 22l-5-5 6.3-6.2A6 6 0 0 1 14 3l-1.3 1.3a4 4 0 0 0 2 2',
 filter:'M3 5h18l-7 8v6l-4 2v-8z',maximize:'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',lock:'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
 loopback:'M7 9a3 3 0 1 0 0 6c2 0 3-1.5 5-3s3-3 5-3a3 3 0 1 1 0 6c-2 0-3-1.5-5-3S9 9 7 9',vlan:'M3 12V4h8l10 10-8 8zM7.5 7.5h.01',
 live:'M12 12h.01M8.5 8.5a5 5 0 0 0 0 7m7-7a5 5 0 0 1 0 7M5.6 5.6a9 9 0 0 0 0 12.8m12.8-12.8a9 9 0 0 1 0 12.8',
 bolt:'M13 2 4 14h7l-1 8 9-12h-7z'
};
</script>
<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={paths[name]||paths.wifi}/></svg>
