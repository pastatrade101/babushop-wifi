# JIACHIE purchase access v2 -- RouterOS 7, existing babu-guest network.
# Use management Wi-Fi. No rules change until the checks below pass.
:put "JIACHIE purchase access v2: checking current rules"
{
    # Find by comment only; validate properties with get, not a compound find.
    # Count returned IDs by iteration, never by the length of an ID string.
    :local requireForward do={
        :local count 0
        :local ruleId
        :foreach candidate in=[/ip firewall filter find comment=$label] do={
            :set count ($count + 1)
            :set ruleId $candidate
        }
        :if ($count != 1) do={ :error ("Expected one rule: " . $label . "; found " . $count) }
        :if ([/ip firewall filter get $ruleId disabled]) do={ :error ("Rule is disabled: " . $label) }
        :if ([/ip firewall filter get $ruleId chain] != "forward") do={ :error ("Rule is not in forward: " . $label) }
        :if ([/ip firewall filter get $ruleId action] != $expectedAction) do={ :error ("Unexpected action: " . $label) }
        :return $ruleId
    }
    :local outbound [$requireForward label="BABU commissioning block outbound" expectedAction="drop"]
    :local privateBlock [$requireForward label="BABU block customer access to private networks" expectedAction="drop"]
    :local replies [$requireForward label="BABU customer internet replies" expectedAction="accept"]
    :local inbound [$requireForward label="BABU commissioning block inbound" expectedAction="drop"]
    :if ([/ip firewall filter get $outbound in-interface] != "babu-guest") do={ :error "Outbound block must match babu-guest." }
    :if ([/ip firewall filter get $privateBlock in-interface] != "babu-guest") do={ :error "Private block must match babu-guest." }
    :if ([/ip firewall filter get $privateBlock dst-address-list] != "babu-private") do={ :error "Private block must use babu-private." }
    :if ([/ip firewall filter get $inbound out-interface] != "babu-guest") do={ :error "Inbound block must match babu-guest." }
    :if ([/ip firewall filter get $replies out-interface] != "babu-guest") do={ :error "Replies must go to babu-guest." }
    :if ([/ip firewall filter get $replies in-interface-list] != "WAN") do={ :error "Replies must come from WAN." }

    :local hotspotCount 0
    :foreach serverId in=[/ip hotspot find name="babu-hotspot"] do={
        :set hotspotCount ($hotspotCount + 1)
        :if ([/ip hotspot get $serverId disabled]) do={ :error "babu-hotspot is disabled." }
        :if ([/ip hotspot get $serverId interface] != "babu-guest") do={ :error "babu-hotspot must use babu-guest." }
    }
    :if ($hotspotCount != 1) do={ :error "Expected one babu-hotspot server." }
    :local privateSeen false
    :local repliesSeen false
    :foreach rule in=[/ip firewall filter find] do={
        :if ($rule = $privateBlock) do={ :set privateSeen true }
        :if (($rule = $outbound) && (!$privateSeen)) do={ :error "Private block must precede outbound block." }
        :if ($rule = $replies) do={ :set repliesSeen true }
        :if (($rule = $inbound) && (!$repliesSeen)) do={ :error "Reply allow must precede inbound block." }
    }

    # Resolve exact hostnames; allow HTTPS only, not all internet traffic.
    :foreach purchaseHost in={"jiachie-wifi.com";"snippe.me"} do={
        :local hostPresent false
        :foreach hostId in=[/ip firewall address-list find list="jiachie-purchase"] do={
            :if ([:tostr [/ip firewall address-list get $hostId address]] = $purchaseHost) do={ :set hostPresent true }
        }
        :if (!$hostPresent) do={ /ip firewall address-list add list=jiachie-purchase address=$purchaseHost comment="JIACHIE purchase host" }
    }
    :local gardenPresent false
    :foreach gardenId in=[/ip hotspot walled-garden ip find comment="JIACHIE purchase HTTPS"] do={ :set gardenPresent true }
    :if (!$gardenPresent) do={
        /ip hotspot walled-garden ip add action=accept server=babu-hotspot src-address=10.78.0.0/24 dst-address-list=jiachie-purchase protocol=tcp dst-port=443 comment="JIACHIE purchase HTTPS"
    }
    :local forwardPresent false
    :foreach forwardId in=[/ip firewall filter find comment="JIACHIE purchase HTTPS before login"] do={ :set forwardPresent true }
    :if (!$forwardPresent) do={
        /ip firewall filter add chain=forward action=accept in-interface=babu-guest out-interface-list=WAN src-address=10.78.0.0/24 dst-address-list=jiachie-purchase protocol=tcp dst-port=443 connection-state=new,established,related place-before=$outbound comment="JIACHIE purchase HTTPS before login"
    }
    :put "JIACHIE purchase access v2 installed. Test Buy a voucher with mobile data OFF and no active voucher."
    /ip firewall address-list print where list="jiachie-purchase"
    /ip hotspot walled-garden ip print detail where comment="JIACHIE purchase HTTPS"
    /ip firewall filter print stats where comment="JIACHIE purchase HTTPS before login"
}
