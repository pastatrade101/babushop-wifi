# JIACHIE pre-login mobile-money access, RouterOS 7.
# Import once from management Wi-Fi; repeating does not create duplicate rules.
# Matches the existing babu-guest/babu-hotspot firewall, not a generic router.
{
    :local outbound [/ip firewall filter find where comment="BABU commissioning block outbound" and chain="forward" and action="drop" and in-interface="babu-guest" and disabled=no]
    :local privateBlock [/ip firewall filter find where comment="BABU block customer access to private networks" and chain="forward" and action="drop" and disabled=no]
    :local replies [/ip firewall filter find where comment="BABU customer internet replies" and chain="forward" and action="accept" and disabled=no]
    :if ([:len $outbound] != 1) do={ :error "Expected one BABU commissioning block outbound. Stop and inspect firewall order." }
    :if ([:len $privateBlock] != 1) do={ :error "Expected one BABU private-network block. Stop and inspect firewall order." }
    :if ([:len $replies] != 1) do={ :error "Expected one BABU customer internet replies rule. Stop and inspect firewall order." }
    :if ([:len [/ip hotspot find where name="babu-hotspot" and interface="babu-guest" and disabled=no]] != 1) do={ :error "Enabled babu-hotspot on babu-guest was not found." }
    :local outboundId [:pick $outbound 0]
    :local privateId [:pick $privateBlock 0]
    :local privateSeen false
    :foreach rule in=[/ip firewall filter find where chain="forward"] do={
        :if ($rule = $privateId) do={ :set privateSeen true }
        :if (($rule = $outboundId) && (!$privateSeen)) do={ :error "Private-network block must precede the outbound block." }
    }
    # DNS names resolve to IPv4 addresses; no blanket CDN ranges or all-HTTPS rule.
    :foreach purchaseHost in={"jiachie-wifi.com";"snippe.me"} do={
        :if ([:len [/ip firewall address-list find where list="jiachie-purchase" and address=$purchaseHost]] = 0) do={
            /ip firewall address-list add list=jiachie-purchase address=$purchaseHost comment="JIACHIE purchase host"
        }
    }
    # Both HotSpot NAT/filter handling and the custom forward firewall need access.
    :if ([:len [/ip hotspot walled-garden ip find where comment="JIACHIE purchase HTTPS"]] = 0) do={
        /ip hotspot walled-garden ip add action=accept server=babu-hotspot src-address=10.78.0.0/24 dst-address-list=jiachie-purchase protocol=tcp dst-port=443 comment="JIACHIE purchase HTTPS"
    }
    :if ([:len [/ip firewall filter find where comment="JIACHIE purchase HTTPS before login"]] = 0) do={
        /ip firewall filter add chain=forward action=accept in-interface=babu-guest out-interface-list=WAN src-address=10.78.0.0/24 dst-address-list=jiachie-purchase protocol=tcp dst-port=443 connection-state=new,established,related place-before=$outboundId comment="JIACHIE purchase HTTPS before login"
    }
    :put "Purchase exceptions installed. Verify DNS entries and test with mobile data OFF before serving customers."
}
