MONGOD_220 = ENV['MONGOD220'] || 'mongod'

DB = [
  ['9000', MONGOD_220],
  ['9001', MONGOD_220],
]

DBDIR = ENV['DBDIR'] || "~/mfid_dbs"

DB.each do |port,exec|
  God.watch do |w|
   pid_file = "#{DBDIR}/#{port}/mognod.pid" 
    params = [
      "--quota",
      "--quotaFiles 1",
      "--smallfiles",
      #"--nojournal",
      "--directoryperdb",
      "--fork",
      "--pidfilepath #{pid_file}",
      "--dbpath #{DBDIR}/#{port}/db",
      "--logpath #{DBDIR}/#{port}/mongod.log",
      "--port #{port}",
      "--auth",
      "--nounixsocket",
      "--noprealloc",
      "--nssize 2",
      #"--nounixsocket",
      "--nohttpinterface"
    ]

    w.interval = 10.seconds
    w.group = 'mongod'
    w.name = "mongod-#{port}"
    w.stop = "kill -s QUIT $(cat #{pid_file})"
    w.start = "#{exec} #{params.join(' ')}"
    w.pid_file = pid_file
    w.keepalive
    w.behavior(:clean_pid_file)
    w.start_grace = 5.seconds
    w.restart_grace = 5.seconds

    #w.uid = 'kamil'
    #w.gid = 'staff'
    #w.chroot = "/Users/kamil/mf/chroot"

    w.restart_if do |restart|
      #restart.condition(:memory_usage) do |c|
      #  c.above = 100.megabytes
      #  c.times = [3, 5]
      #end
      restart.condition(:cpu_usage) do |c|
        c.above = 95.percent
        c.times = 2
      end
    end

  end
end
